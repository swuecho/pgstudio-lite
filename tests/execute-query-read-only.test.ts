import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The hard guarantee behind read-only connections: every statement runs inside
 * an explicit `BEGIN READ ONLY` transaction, so a statement that tampers with
 * session settings cannot make the *next* statement writable. The parser-level
 * check in lib/sql-write-detection.ts is the friendlier first line.
 */
const state = vi.hoisted(() => ({
  readOnly: true,
  failOn: null as string | null,
  queries: [] as string[],
}))

vi.mock('@/lib/db/pool', () => {
  const client = {
    async query(input: string | { text: string; values?: unknown[] }) {
      const text = typeof input === 'string' ? input : input.text
      state.queries.push(text)
      if (state.failOn && text === state.failOn) {
        throw Object.assign(new Error('cannot execute in a read-only transaction'), { code: '25006' })
      }
      return { command: 'SELECT', rowCount: 1, rows: [{ n: 1 }], fields: [{ name: 'n' }] }
    },
    release() {},
  }
  return { getPool: () => ({ connect: async () => client }) }
})

vi.mock('@/lib/db/connections', () => ({
  getConnectionByName: () => ({
    id: 'c1',
    name: 'ro',
    connectionString: 'postgres://example/db',
    isDefault: true,
    readOnly: state.readOnly,
  }),
}))

vi.mock('@/lib/db/introspect', () => ({
  getPrimaryKeyColumns: async () => [],
}))

import { executeQuery } from '@/lib/db/query'

describe('executeQuery on a read-only connection', () => {
  beforeEach(() => {
    state.readOnly = true
    state.failOn = null
    state.queries = []
  })

  it('wraps each statement in its own read-only transaction', async () => {
    const result = await executeQuery({ query: 'select 1; select 2', connectionName: 'ro' })

    expect(result.statements).toHaveLength(2)
    expect(state.queries).toEqual([
      'set default_transaction_read_only = on',
      'set statement_timeout = 15000',
      'begin read only',
      'select 1',
      'commit',
      'begin read only',
      'select 2',
      'commit',
      'set default_transaction_read_only = off',
      'set statement_timeout = default',
    ])
  })

  it('rolls back and maps a Postgres read-only violation to 403', async () => {
    state.failOn = 'select 1'

    await expect(executeQuery({ query: 'select 1', connectionName: 'ro' })).rejects.toMatchObject({
      statusCode: 403,
      code: '25006',
    })
    expect(state.queries).toContain('rollback')
    expect(state.queries).not.toContain('commit')
  })

  it('refuses a hidden write before anything runs', async () => {
    await expect(
      executeQuery({
        query:
          'set default_transaction_read_only = off; with t as (delete from foo returning *) select * from t',
        connectionName: 'ro',
      })
    ).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('read-only') })

    // Neither user statement ran; the only SETs are the guard's own on/off pair.
    expect(state.queries).not.toContain('begin read only')
    expect(state.queries.filter((text) => text.startsWith('set default_transaction_read_only'))).toEqual([
      'set default_transaction_read_only = on',
      'set default_transaction_read_only = off',
    ])
    expect(state.queries.some((text) => text.includes('delete from foo'))).toBe(false)
  })

  it('leaves read-write connections alone', async () => {
    state.readOnly = false

    await executeQuery({ query: 'select 1', connectionName: 'rw' })

    expect(state.queries).toEqual([
      'set statement_timeout = 15000',
      'select 1',
      'set statement_timeout = default',
    ])
  })
})
