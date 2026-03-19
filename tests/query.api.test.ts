import { beforeEach, describe, expect, it, vi } from 'vitest'
import queryHandler from '../pages/api/query'
import { executeQuery } from '../lib/db'

vi.mock('../lib/db', () => ({
  executeQuery: vi.fn(),
}))

type ApiResult = {
  statusCode: number
  payload: unknown
  headers: Record<string, string>
}

async function invokeApi(input: { method: string; query?: Record<string, unknown>; body?: unknown }): Promise<ApiResult> {
  const headers: Record<string, string> = {}
  let statusCode = 200
  let payload: unknown = null

  const req = {
    method: input.method,
    query: input.query || {},
    body: input.body,
  }

  const res = {
    setHeader(name: string, value: string) {
      headers[name] = value
    },
    status(code: number) {
      statusCode = code
      return this
    },
    json(body: unknown) {
      payload = body
      return this
    },
  }

  await queryHandler(req as any, res as any)
  return { statusCode, payload, headers }
}

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
