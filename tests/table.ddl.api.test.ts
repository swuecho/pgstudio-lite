import { describe, expect, it, vi, beforeEach } from 'vitest'
import { invokeApi as callApi } from './helpers/invoke-api'
import ddlHandler from '../pages/api/tables/[table]/ddl'
import * as db from '../lib/db'

vi.mock('../lib/db', () => ({
  getTableDdl: vi.fn(async () => 'CREATE TABLE "notes" (\n  "id" integer NOT NULL\n);'),
}))

const invokeApi = ({ table, query }: { table?: string; query?: Record<string, unknown> }) =>
  callApi(ddlHandler, { method: 'GET', query: { table: table || 'notes', ...(query || {}) } })

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
