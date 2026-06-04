import { describe, expect, it, vi, beforeEach } from 'vitest'
import ddlHandler from '../pages/api/tables/[table]/ddl'
import * as db from '../lib/db'

vi.mock('../lib/db', () => ({
  getTableDdl: vi.fn(async () => 'CREATE TABLE "notes" (\n  "id" integer NOT NULL\n);'),
}))

type ApiResult = {
  statusCode: number
  payload: unknown
}

async function invokeApi(input: {
  table?: string
  query?: Record<string, unknown>
}): Promise<ApiResult> {
  let statusCode = 200
  let payload: unknown = null

  const req = {
    method: 'GET',
    query: { table: input.table || 'notes', ...(input.query || {}) },
  }

  const res = {
    status(code: number) {
      statusCode = code
      return this
    },
    json(body: unknown) {
      payload = body
      return this
    },
  }

  await ddlHandler(req as never, res as never)
  return { statusCode, payload }
}

describe('table ddl API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns ddl for the requested table', async () => {
    const result = await invokeApi({ query: { schema: 'public' } })

    expect(result.statusCode).toBe(200)
    expect(result.payload).toEqual({
      ddl: 'CREATE TABLE "notes" (\n  "id" integer NOT NULL\n);',
    })
    expect(db.getTableDdl).toHaveBeenCalledWith(undefined, 'public', 'notes')
  })
})
