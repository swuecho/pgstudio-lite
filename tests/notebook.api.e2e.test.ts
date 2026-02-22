import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import notebooksHandler from '../pages/api/notebooks/index'
import notebookCellsHandler from '../pages/api/notebooks/[id]/cells'
import runCellHandler from '../pages/api/notebooks/[id]/run-cell'
import { sqlite } from '../lib/meta-db'
import { executeQuery } from '../lib/db'

vi.mock('../lib/db', async () => {
  const actual = await vi.importActual<typeof import('../lib/db')>('../lib/db')
  return {
    ...actual,
    getConnections: vi.fn(() => [
      {
        id: 'conn-default',
        name: 'default',
        connectionString: 'postgres://example.invalid/db',
        isDefault: true,
        readOnly: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]),
    executeQuery: vi.fn(),
  }
})

type ApiResult = {
  statusCode: number
  payload: unknown
  headers: Record<string, string>
}

type ApiHandler = (req: any, res: any) => unknown

function invokeApi(
  handler: ApiHandler,
  input: { method: string; query?: Record<string, unknown>; body?: unknown }
): Promise<ApiResult> | ApiResult {
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

  const maybePromise = handler(req as any, res as any)
  if (maybePromise && typeof (maybePromise as Promise<unknown>).then === 'function') {
    return (maybePromise as Promise<unknown>).then(() => ({ statusCode, payload, headers }))
  }
  return { statusCode, payload, headers }
}

function resetNotebookFixtures() {
  sqlite.exec(`
    DELETE FROM notebook_cells;
    DELETE FROM notebooks;
    DELETE FROM query_snippets;
    DELETE FROM query_history;
    DELETE FROM db_connections;
  `)
}

async function createNotebookFixture(title = 'Fixture notebook') {
  const response = await invokeApi(notebooksHandler, {
    method: 'POST',
    body: { title },
  })
  expect(response.statusCode).toBe(200)
  const payload = response.payload as { item: { id: string } }
  return payload.item.id
}

describe('notebook API e2e', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-22T00:00:00.000Z'))
    resetNotebookFixtures()
    vi.mocked(executeQuery).mockResolvedValue({
      statements: [{ command: 'SELECT', rowCount: 1, fields: ['v'], rows: [{ v: 1 }] }],
      totalRows: 1,
      durationMs: 5,
    } as any)
  })

  afterEach(() => {
    resetNotebookFixtures()
    vi.useRealTimers()
  })

  it('create notebook flow: creates notebook via API', async () => {
    const response = await invokeApi(notebooksHandler, {
      method: 'POST',
      body: { title: 'Notebook A' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.payload).toMatchObject({
      item: {
        title: 'Notebook A',
        connection_name: 'default',
      },
    })
  })

  it('create notebook failure: rejects empty title', async () => {
    const response = await invokeApi(notebooksHandler, {
      method: 'POST',
      body: { title: '' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.payload).toMatchObject({
      error: expect.any(String),
      code: 'INVALID_REQUEST',
    })
  })

  it('add cell flow: adds sql cell to an existing notebook', async () => {
    const notebookId = await createNotebookFixture('Notebook B')

    const response = await invokeApi(notebookCellsHandler, {
      method: 'POST',
      query: { id: notebookId },
      body: { type: 'sql', content: 'select 1;' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.payload).toMatchObject({
      item: {
        notebook_id: notebookId,
        type: 'sql',
      },
    })
  })

  it('add cell failure: returns 404 for missing notebook', async () => {
    const response = await invokeApi(notebookCellsHandler, {
      method: 'POST',
      query: { id: 'missing-notebook' },
      body: { type: 'sql', content: 'select 1;' },
    })

    expect(response.statusCode).toBe(404)
    expect(response.payload).toMatchObject({
      error: 'notebook not found',
    })
  })

  it('run cell flow: executes sql cell and returns result', async () => {
    const notebookId = await createNotebookFixture('Notebook C')
    const cellResponse = await invokeApi(notebookCellsHandler, {
      method: 'POST',
      query: { id: notebookId },
      body: { type: 'sql', content: 'select 1 as v;' },
    })
    const cellId = (cellResponse.payload as { item: { id: string } }).item.id

    const response = await invokeApi(runCellHandler, {
      method: 'POST',
      query: { id: notebookId },
      body: { cellId, query: 'select 1 as v;' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.payload).toMatchObject({
      totalRows: 1,
      durationMs: 5,
    })
    expect(vi.mocked(executeQuery)).toHaveBeenCalledTimes(1)
  })

  it('run cell failure: rejects empty query', async () => {
    const notebookId = await createNotebookFixture('Notebook D')
    const cellResponse = await invokeApi(notebookCellsHandler, {
      method: 'POST',
      query: { id: notebookId },
      body: { type: 'sql', content: 'select 1;' },
    })
    const cellId = (cellResponse.payload as { item: { id: string } }).item.id

    const response = await invokeApi(runCellHandler, {
      method: 'POST',
      query: { id: notebookId },
      body: { cellId, query: '' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.payload).toMatchObject({
      error: 'query is required',
      code: 'INVALID_REQUEST',
    })
  })
})
