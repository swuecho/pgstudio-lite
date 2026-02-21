import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as sqlService from '../features/sql/sql.service'

type MockResponse = {
  ok: boolean
  status: number
  payload: unknown
}

function installFetchMock(queue: MockResponse[]) {
  const calls: Array<{ path: string; options?: RequestInit }> = []
  vi.stubGlobal('fetch', async (path: string | URL | Request, options?: RequestInit) => {
    calls.push({ path: String(path), options })
    const current = queue.shift()
    if (!current) throw new Error('Missing mock response')
    return {
      ok: current.ok,
      status: current.status,
      json: async () => current.payload,
    } as Response
  })
  return calls
}

describe('sql service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('runQuery posts SQL body', async () => {
    const calls = installFetchMock([
      {
        ok: true,
        status: 200,
        payload: {
          statements: [{ command: 'SELECT', rowCount: 1, fields: ['id'], rows: [{ id: 1 }] }],
          totalRows: 1,
          durationMs: 5,
        },
      },
    ])

    const result = await sqlService.runQuery('default', 'select 1;')

    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe('/api/query')
    expect(calls[0].options?.method).toBe('POST')
    expect(calls[0].options?.body).toBe(JSON.stringify({ connectionName: 'default', query: 'select 1;' }))
    expect(result.totalRows).toBe(1)
  })

  it('getSchemaColumns URL-encodes params', async () => {
    const calls = installFetchMock([{ ok: true, status: 200, payload: { columns: [{ name: 'id' }] } }])

    await sqlService.getSchemaColumns('my conn', 'public schema', 'user-table')

    expect(calls[0].path).toBe(
      '/api/schema/columns?connectionName=my%20conn&schema=public%20schema&table=user-table'
    )
  })

  it('clearHistory surfaces API error', async () => {
    installFetchMock([{ ok: false, status: 500, payload: { error: 'boom' } }])

    await expect(sqlService.clearHistory()).rejects.toThrow('boom')
  })

  it('getSnippets scopes by connectionName', async () => {
    const calls = installFetchMock([{ ok: true, status: 200, payload: { items: [] } }])
    await sqlService.getSnippets(300, 'staging')
    expect(calls[0].path).toBe('/api/snippets?limit=300&connectionName=staging')
  })

  it('createSnippet sends connectionName in payload', async () => {
    const calls = installFetchMock([
      {
        ok: true,
        status: 200,
        payload: {
          item: {
            id: 'snip-1',
            title: 's',
            query_text: 'select 1;',
            connection_name: 'staging',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        },
      },
    ])

    await sqlService.createSnippet('s', 'select 1;', 'staging')

    expect(calls[0].options?.method).toBe('POST')
    expect(calls[0].options?.body).toBe(
      JSON.stringify({ title: 's', queryText: 'select 1;', connectionName: 'staging' })
    )
  })
})
