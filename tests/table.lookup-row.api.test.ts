import { describe, expect, it, vi, beforeEach } from 'vitest'
import { invokeApi as callApi } from './helpers/invoke-api'
import lookupRowHandler from '../pages/api/tables/[table]/lookup-row'
import * as db from '../lib/db'

vi.mock('../lib/db', () => ({
  lookupTableRow: vi.fn(async () => ({
    row: { id: 42, name: 'alice' },
    columns: [{ name: 'id', dataType: 'integer', isNullable: false, isIdentity: false, isPrimaryKey: true }],
  })),
}))

const invokeApi = ({ table, body }: { table?: string; body?: unknown }) =>
  callApi(lookupRowHandler, { method: 'POST', query: { table: table || 'users' }, body })

describe('table lookup-row API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls lookupTableRow with schema and match', async () => {
    const result = await invokeApi({
      body: {
        connectionName: 'local',
        schema: 'public',
        match: { id: 42 },
      },
    })

    expect(result.statusCode).toBe(200)
    expect(db.lookupTableRow).toHaveBeenCalledWith('local', 'public', 'users', { id: 42 })
    expect(result.payload).toEqual({
      row: { id: 42, name: 'alice' },
      columns: [
        { name: 'id', dataType: 'integer', isNullable: false, isIdentity: false, isPrimaryKey: true },
      ],
    })
  })

  it('rejects empty match', async () => {
    const result = await invokeApi({
      body: {
        schema: 'public',
        match: {},
      },
    })

    expect(result.statusCode).toBe(400)
    expect(db.lookupTableRow).not.toHaveBeenCalled()
  })

  it('rejects non-POST methods', async () => {
    const result = await callApi(lookupRowHandler, { method: 'GET', query: { table: 'users' }, body: {} })
    expect(result.statusCode).toBe(405)
  })
})
