import { describe, expect, it, vi, beforeEach } from 'vitest'
import rowsHandler from '../pages/api/tables/[table]/rows'
import * as db from '../lib/db'

vi.mock('../lib/db', () => ({
  getTableColumns: vi.fn(async () => []),
  getTableRows: vi.fn(async () => ({ rows: [], total: 0 })),
  insertTableRow: vi.fn(async () => ({ id: 1 })),
  updateTableRowByPrimaryKey: vi.fn(async () => undefined),
  deleteTableRowByPrimaryKey: vi.fn(async () => undefined),
}))

type ApiResult = {
  statusCode: number
  payload: unknown
  headers: Record<string, string>
}

async function invokeApi(input: {
  method: string
  table?: string
  query?: Record<string, unknown>
  body?: unknown
}): Promise<ApiResult> {
  const headers: Record<string, string> = {}
  let statusCode = 200
  let payload: unknown = null

  const req = {
    method: input.method,
    query: { table: input.table || 'notes', ...(input.query || {}) },
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

  await rowsHandler(req as any, res as any)
  return { statusCode, payload, headers }
}

describe('table rows API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts a row via POST', async () => {
    vi.mocked(db.insertTableRow).mockResolvedValueOnce({
      id: 9,
      title: 'new',
      _rowKey: { id: 9 },
    } as Awaited<ReturnType<typeof db.insertTableRow>>)

    const response = await invokeApi({
      method: 'POST',
      body: { schema: 'public', connectionName: 'default', values: { title: 'new' } },
    })

    expect(response.statusCode).toBe(200)
    expect(response.payload).toMatchObject({ row: { id: 9, title: 'new' } })
    expect(db.insertTableRow).toHaveBeenCalledWith('default', 'public', 'notes', { title: 'new' })
  })

  it('returns 404 when patch targets a missing row', async () => {
    vi.mocked(db.updateTableRowByPrimaryKey).mockRejectedValueOnce(
      Object.assign(new Error('row not found'), { statusCode: 404 })
    )

    const response = await invokeApi({
      method: 'PATCH',
      body: { schema: 'public', connectionName: 'default', rowKey: { id: 1 }, patch: { title: 'updated' } },
    })

    expect(response.statusCode).toBe(404)
    expect(response.payload).toMatchObject({ error: 'row not found' })
  })

  it('returns 404 when delete targets a missing row', async () => {
    vi.mocked(db.deleteTableRowByPrimaryKey).mockRejectedValueOnce(
      Object.assign(new Error('row not found'), { statusCode: 404 })
    )

    const response = await invokeApi({
      method: 'DELETE',
      body: { schema: 'public', connectionName: 'default', rowKey: { id: 1 } },
    })

    expect(response.statusCode).toBe(404)
    expect(response.payload).toMatchObject({ error: 'row not found' })
  })
})
