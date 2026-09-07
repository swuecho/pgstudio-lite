import { describe, expect, it, vi, beforeEach } from 'vitest'
import { invokeApi as callApi, type ApiCall } from './helpers/invoke-api'
import rowsHandler from '../pages/api/tables/[table]/rows'
import * as db from '../lib/db'

vi.mock('../lib/db', () => ({
  getTableColumns: vi.fn(async () => [
    { name: 'id', dataType: 'integer', isNullable: false, isIdentity: true, isPrimaryKey: true },
    { name: 'amount', dataType: 'numeric', isNullable: true, isIdentity: false, isPrimaryKey: false },
    { name: 'title', dataType: 'text', isNullable: true, isIdentity: false, isPrimaryKey: false },
  ]),
  getTableRows: vi.fn(async () => ({ rows: [], total: 0 })),
  insertTableRow: vi.fn(async () => ({ id: 1 })),
  updateTableRowByPrimaryKey: vi.fn(async () => undefined),
  deleteTableRowByPrimaryKey: vi.fn(async () => undefined),
}))

const invokeApi = ({ table, ...call }: ApiCall & { table?: string }) =>
  callApi(rowsHandler, { ...call, query: { table: table || 'notes', ...(call.query || {}) } })

describe('table rows API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes gt filter to getTableRows', async () => {
    await invokeApi({
      method: 'GET',
      query: {
        schema: 'public',
        filterColumn: 'amount',
        filterMode: 'gt',
        filterValue: '10',
      },
    })

    expect(db.getTableRows).toHaveBeenCalledWith(
      undefined,
      'public',
      'notes',
      expect.objectContaining({
        filterColumn: 'amount',
        filterMode: 'gt',
        filterValue: '10',
      })
    )
  })

  it('passes between filter with end value', async () => {
    await invokeApi({
      method: 'GET',
      query: {
        schema: 'public',
        filterColumn: 'amount',
        filterMode: 'between',
        filterValue: '10',
        filterValueEnd: '100',
      },
    })

    expect(db.getTableRows).toHaveBeenCalledWith(
      undefined,
      'public',
      'notes',
      expect.objectContaining({
        filterMode: 'between',
        filterValue: '10',
        filterValueEnd: '100',
      })
    )
  })

  it('passes is_null filter without value', async () => {
    await invokeApi({
      method: 'GET',
      query: {
        schema: 'public',
        filterColumn: 'title',
        filterMode: 'is_null',
      },
    })

    expect(db.getTableRows).toHaveBeenCalledWith(
      undefined,
      'public',
      'notes',
      expect.objectContaining({
        filterColumn: 'title',
        filterMode: 'is_null',
      })
    )
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
  })
})
