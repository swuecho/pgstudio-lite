import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invokeApi as callApi, type ApiCall } from './helpers/invoke-api'
import queryHandler from '../pages/api/query'
import { executeQuery } from '../lib/db'

vi.mock('../lib/db', () => ({
  executeQuery: vi.fn(),
}))

const invokeApi = (call: ApiCall) => callApi(queryHandler, call)

describe('query API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns guardrail metadata from executeQuery', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      statements: [
        {
          command: 'SELECT',
          rowCount: 999,
          returnedRowCount: 500,
          truncated: true,
          fields: ['id'],
          rows: [{ id: 1 }],
          tableTarget: { schema: 'public', table: 'items' },
        },
      ],
      totalRows: 999,
      durationMs: 12,
      ranAt: '2026-03-19T00:00:00.000Z',
    } as any)

    const response = await invokeApi({
      method: 'POST',
      body: { query: 'select * from items', connectionName: 'default' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.payload).toMatchObject({
      totalRows: 999,
      statements: [
        {
          rowCount: 999,
          returnedRowCount: 500,
          truncated: true,
          tableTarget: { schema: 'public', table: 'items' },
        },
      ],
    })
  })
})

it('passes an explicit display limit without rewriting SQL', async () => {
  vi.mocked(executeQuery).mockResolvedValue({} as any)
  await invokeApi({
    method: 'POST',
    body: { query: '  select 1;', connectionName: 'default', rowLimit: 100 },
  })
  expect(executeQuery).toHaveBeenLastCalledWith({
    query: '  select 1;',
    connectionName: 'default',
    rowLimit: 100,
  })
})

it.each([0, 501, 1.5, '100'])('rejects invalid result limit %s', async (rowLimit) => {
  expect((await invokeApi({ method: 'POST', body: { query: 'select 1', rowLimit } })).statusCode).toBe(400)
})

it('returns structured database diagnostics', async () => {
  vi.mocked(executeQuery).mockRejectedValue(
    Object.assign(new Error('Missing column'), {
      statusCode: 400,
      code: '42703',
      details: { position: 8, hint: 'Try id' },
    })
  )
  const response = await invokeApi({ method: 'POST', body: { query: 'select missing' } })
  expect(response.payload).toMatchObject({
    error: 'Missing column',
    code: '42703',
    details: { position: 8, hint: 'Try id' },
  })
})
