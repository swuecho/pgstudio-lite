import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as tableService from '../features/table/table.service'

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

describe('table service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('getRows builds query params with filter', async () => {
    const calls = installFetchMock([{ ok: true, status: 200, payload: { columns: [], rows: [], total: 0 } }])

    await tableService.getRows({
      table: 'notes list',
      schema: 'public',
      connectionName: 'default',
      page: 2,
      pageSize: 25,
      sortBy: 'id',
      sortOrder: 'desc',
      filterColumn: 'title',
      filterValue: 'todo',
      filterMode: 'contains',
    })

    expect(calls[0].path).toContain('filterColumn=title')
    expect(calls[0].path).toContain('filterValue=todo')
    expect(calls[0].path).toContain('filterMode=contains')
  })

  it('getRows sends numeric gt filter', async () => {
    const calls = installFetchMock([{ ok: true, status: 200, payload: { columns: [], rows: [], total: 0 } }])

    await tableService.getRows({
      table: 'orders',
      schema: 'public',
      connectionName: 'default',
      page: 0,
      pageSize: 10,
      sortBy: '',
      sortOrder: 'asc',
      filterColumn: 'amount',
      filterValue: '100',
      filterMode: 'gt',
    })

    expect(calls[0].path).toContain('filterColumn=amount')
    expect(calls[0].path).toContain('filterMode=gt')
    expect(calls[0].path).toContain('filterValue=100')
  })

  it('getRows sends is_empty filter without filter value', async () => {
    const calls = installFetchMock([{ ok: true, status: 200, payload: { columns: [], rows: [], total: 0 } }])

    await tableService.getRows({
      table: 'notes',
      schema: 'public',
      connectionName: 'default',
      page: 0,
      pageSize: 10,
      sortBy: '',
      sortOrder: 'asc',
      filterColumn: 'title',
      filterValue: '',
      filterMode: 'is_empty',
    })

    expect(calls[0].path).toContain('filterColumn=title')
    expect(calls[0].path).toContain('filterMode=is_empty')
    expect(calls[0].path.includes('filterValue=')).toBe(false)
  })

  it('getRows omits filter params for blank filter value', async () => {
    const calls = installFetchMock([{ ok: true, status: 200, payload: { columns: [], rows: [], total: 0 } }])

    await tableService.getRows({
      table: 'notes',
      schema: 'public',
      connectionName: 'default',
      page: 0,
      pageSize: 10,
      sortBy: 'id',
      sortOrder: 'asc',
      filterColumn: 'title',
      filterValue: '   ',
      filterMode: 'equals',
    })

    expect(calls[0].path).toMatch(/^\/api\/tables\/notes\/rows\?/)
    expect(calls[0].path.includes('schema=public')).toBe(true)
    expect(calls[0].path.includes('filterColumn=')).toBe(false)
    expect(calls[0].path.includes('filterValue=')).toBe(false)
    expect(calls[0].path.includes('filterMode=')).toBe(false)
  })

  it('getForeignKeyOptions includes selected value', async () => {
    const calls = installFetchMock([{ ok: true, status: 200, payload: { options: [], truncated: false } }])

    await tableService.getForeignKeyOptions({
      connectionName: 'default',
      schema: 'public',
      table: 'orders',
      column: 'user_id',
      search: 'ali',
      selectedValue: '42',
      limit: 25,
    })

    expect(calls[0].path).toContain('/api/tables/orders/fk-options?')
    expect(calls[0].path).toContain('connectionName=default')
    expect(calls[0].path).toContain('schema=public')
    expect(calls[0].path).toContain('column=user_id')
    expect(calls[0].path).toContain('search=ali')
    expect(calls[0].path).toContain('selectedValue=42')
    expect(calls[0].path).toContain('limit=25')
  })

  it('createRow sends POST with values', async () => {
    const calls = installFetchMock([{ ok: true, status: 200, payload: { row: { id: 3, name: 'new' } } }])

    await tableService.createRow('notes', {
      connectionName: 'default',
      schema: 'public',
      values: { name: 'new' },
    })

    expect(calls[0].path).toBe('/api/tables/notes/rows')
    expect(calls[0].options?.method).toBe('POST')
    expect(calls[0].options?.body).toBe(
      JSON.stringify({ connectionName: 'default', schema: 'public', values: { name: 'new' } })
    )
  })

  it('patchRow sends PATCH with payload', async () => {
    const calls = installFetchMock([{ ok: true, status: 200, payload: { ok: true } }])

    await tableService.patchRow('notes', {
      connectionName: 'default',
      schema: 'public',
      rowKey: { id: 1 },
      patch: { title: 'new' },
    })

    expect(calls[0].path).toBe('/api/tables/notes/rows')
    expect(calls[0].options?.method).toBe('PATCH')
    expect(calls[0].options?.body).toBe(
      JSON.stringify({
        connectionName: 'default',
        schema: 'public',
        rowKey: { id: 1 },
        patch: { title: 'new' },
      })
    )
  })
})
