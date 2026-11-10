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
  /** Rows a capped SELECT finds, and the cap each one was read with. */
  selectRows: 1,
  caps: [] as number[],
}))

function record(text: string) {
  state.queries.push(text)
  if (state.failOn && text === state.failOn) {
    throw Object.assign(new Error('cannot execute in a read-only transaction'), { code: '25006' })
  }
}

vi.mock('@/lib/db/pool', () => {
  const client = {
    async query(input: string | { text: string; values?: unknown[] }) {
      record(typeof input === 'string' ? input : input.text)
      return { command: 'SELECT', rowCount: 1, rows: [{ n: 1 }], fields: [{ name: 'n' }] }
    },
    release() {},
  }
  return { getPool: () => ({ connect: async () => client }), POOL_STATEMENT_TIMEOUT_MS: 30000 }
})

// SELECTs are read through a cursor capped at the display limit + 1; a cut-off
// read has no command tag, like the real portal.
vi.mock('@/lib/db/capped-query', () => ({
  async queryCapped(_client: unknown, text: string, _values: unknown, maxRows: number) {
    record(text)
    state.caps.push(maxRows)
    const rows = Array.from({ length: Math.min(state.selectRows, maxRows) }, (_, n) => ({ n }))
    const cut = rows.length === maxRows
    return {
      command: cut ? null : 'SELECT',
      rowCount: cut ? null : rows.length,
      fields: [{ name: 'n' }],
      rows,
    }
  },
}))

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
    state.selectRows = 1
    state.caps = []
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
      'set statement_timeout = 30000',
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
      'set statement_timeout = 30000',
    ])
  })

  it('stops reading a SELECT one row past the limit and flags the count as a lower bound', async () => {
    state.readOnly = false
    state.selectRows = 10_000

    const result = await executeQuery({ query: 'select n from big', connectionName: 'rw', rowLimit: 100 })

    expect(state.caps).toEqual([101])
    expect(result.statements[0]).toMatchObject({
      command: 'SELECT',
      rowCount: 100,
      rowCountExact: false,
      returnedRowCount: 100,
      truncated: true,
    })
  })

  it('keeps an exact count when the SELECT fits under the limit', async () => {
    state.readOnly = false
    state.selectRows = 100

    const result = await executeQuery({ query: 'select n from big', connectionName: 'rw', rowLimit: 100 })

    expect(result.statements[0]).toMatchObject({ rowCount: 100, rowCountExact: true, truncated: false })
  })

  it('reads data-modifying statements in full', async () => {
    state.readOnly = false

    await executeQuery({ query: 'update foo set n = 1 returning n', connectionName: 'rw' })

    expect(state.caps).toEqual([])
    expect(state.queries).toContain('update foo set n = 1 returning n')
  })
})
