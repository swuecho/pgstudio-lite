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

    expect(calls[0].path).toBe(
      '/api/tables/notes%20list/rows?connectionName=default&schema=public&limit=25&offset=50&sortBy=id&sortOrder=desc&filterColumn=title&filterValue=todo&filterMode=contains'
    )
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
      JSON.stringify({ connectionName: 'default', schema: 'public', rowKey: { id: 1 }, patch: { title: 'new' } })
    )
  })
})
