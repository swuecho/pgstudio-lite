import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as notebookService from '../features/notebook/notebook.service'

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

describe('notebook service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('getNotebook URL-encodes notebook id', async () => {
    const calls = installFetchMock([
      { ok: true, status: 200, payload: { notebook: { id: 'a b' }, cells: [] } },
    ])

    await notebookService.getNotebook('a b')

    expect(calls[0].path).toBe('/api/notebooks/a%20b')
  })

  it('runCell posts notebook run payload', async () => {
    const calls = installFetchMock([
      {
        ok: true,
        status: 200,
        payload: {
          statements: [{ command: 'SELECT', rowCount: 1, fields: ['id'], rows: [{ id: 1 }] }],
          totalRows: 1,
          durationMs: 3,
        },
      },
    ])

    const result = await notebookService.runCell('nb-1', 'cell-1', 'select 1;')

    expect(calls[0].path).toBe('/api/notebooks/nb-1/run-cell')
    expect(calls[0].options?.method).toBe('POST')
    expect(calls[0].options?.body).toBe(JSON.stringify({ cellId: 'cell-1', query: 'select 1;' }))
    expect(result.totalRows).toBe(1)
  })

  it('runCell includes input values when provided', async () => {
    const calls = installFetchMock([
      {
        ok: true,
        status: 200,
        payload: {
          statements: [{ command: 'SELECT', rowCount: 1, fields: ['id'], rows: [{ id: 1 }] }],
          totalRows: 1,
          durationMs: 3,
        },
      },
    ])

    await notebookService.runCell('nb-1', 'cell-1', 'select * from t where d >= {{start_date}};', {
      start_date: '2026-02-01',
    })

    expect(calls[0].options?.body).toBe(
      JSON.stringify({
        cellId: 'cell-1',
        query: 'select * from t where d >= {{start_date}};',
        inputValues: { start_date: '2026-02-01' },
      })
    )
  })

  it('createCell sends type and content', async () => {
    const calls = installFetchMock([
      {
        ok: true,
        status: 200,
        payload: {
          item: { id: 'cell-1', notebook_id: 'nb-1', type: 'markdown', position: 0, content: '# title' },
          cells: [],
        },
      },
    ])

    await notebookService.createCell('nb-1', { type: 'markdown', content: '# title' })

    expect(calls[0].path).toBe('/api/notebooks/nb-1/cells')
    expect(calls[0].options?.method).toBe('POST')
    expect(calls[0].options?.body).toBe(JSON.stringify({ type: 'markdown', content: '# title' }))
  })

  it('createCell includes position when provided', async () => {
    const calls = installFetchMock([
      {
        ok: true,
        status: 200,
        payload: {
          item: { id: 'cell-2', notebook_id: 'nb-1', type: 'sql', position: 2, content: 'select 1;' },
          cells: [],
        },
      },
    ])

    await notebookService.createCell('nb-1', { type: 'sql', content: 'select 1;', position: 2 })

    expect(calls[0].path).toBe('/api/notebooks/nb-1/cells')
    expect(calls[0].options?.method).toBe('POST')
    expect(calls[0].options?.body).toBe(JSON.stringify({ type: 'sql', content: 'select 1;', position: 2 }))
  })

  it('importNotebook posts payload to import endpoint', async () => {
    const calls = installFetchMock([
      {
        ok: true,
        status: 200,
        payload: {
          ok: true,
          notebook_id: 'nb-imported',
          warnings: [],
          notebook: { spec_version: '1.0', title: 'Imported', cells: [{ id: 'c1', type: 'markdown', content: '# title' }] },
        },
      },
    ])

    const payload = {
      mode: 'create' as const,
      notebook: {
        spec_version: '1.0' as const,
        title: 'Imported',
        cells: [{ id: 'c1', type: 'markdown' as const, content: '# title' }],
      },
    }
    await notebookService.importNotebook(payload)

    expect(calls[0].path).toBe('/api/notebooks/import')
    expect(calls[0].options?.method).toBe('POST')
    expect(calls[0].options?.body).toBe(JSON.stringify(payload))
  })

  it('exportNotebook requests export endpoint', async () => {
    const calls = installFetchMock([
      {
        ok: true,
        status: 200,
        payload: { spec_version: '1.0', id: 'nb-1', title: 'Exported', cells: [{ id: 'c1', type: 'markdown', content: '# title' }] },
      },
    ])

    await notebookService.exportNotebook('nb-1')

    expect(calls[0].path).toBe('/api/notebooks/nb-1/export')
    expect(calls[0].options?.method).toBeUndefined()
  })
})
