import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import notebooksHandler from '../pages/api/notebooks/index'
import notebookCellsHandler from '../pages/api/notebooks/[id]/cells'
import runCellHandler from '../pages/api/notebooks/[id]/run-cell'
import notebookExportHandler from '../pages/api/notebooks/[id]/export'
import notebookPatchHandler from '../pages/api/notebooks/[id]/patch'
import notebookImportHandler from '../pages/api/notebooks/import'
import { sqlite } from '../lib/meta-db'
import { executeQuery } from '../lib/db'

vi.mock('../lib/db', () => {
  return {
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

  it('import + export flow: imports canonical notebook and exports it', async () => {
    const importResponse = await invokeApi(notebookImportHandler, {
      method: 'POST',
      body: {
        mode: 'create',
        notebook: {
          spec_version: '1.0',
          title: 'Imported Notebook',
          description: 'Imported by test',
          connection_name: 'default',
          metadata: { source: 'vitest' },
          cells: [
            { id: 'c1', type: 'markdown', content: '# Hello' },
            {
              id: 'w1',
              type: 'widget',
              content: '',
              metadata: {
                widgetType: 'date',
                key: 'start_date',
                label: 'Start Date',
                value: '2026-01-01',
                required: true,
                autoRun: true,
              },
            },
            { id: 'c3', type: 'sql', content: 'select {{start_date}} as d;' },
          ],
        },
      },
    })

    expect(importResponse.statusCode).toBe(200)
    expect(importResponse.payload).toMatchObject({
      ok: true,
      warnings: [],
      notebook: {
        spec_version: '1.0',
        title: 'Imported Notebook',
        description: 'Imported by test',
        connection_name: 'default',
        metadata: { source: 'vitest' },
      },
    })
    const notebookId = (importResponse.payload as { notebook_id: string }).notebook_id

    const exportResponse = await invokeApi(notebookExportHandler, {
      method: 'GET',
      query: { id: notebookId },
    })

    expect(exportResponse.statusCode).toBe(200)
    expect(exportResponse.payload).toMatchObject({
      spec_version: '1.0',
      id: notebookId,
      title: 'Imported Notebook',
      description: 'Imported by test',
      connection_name: 'default',
      metadata: { source: 'vitest' },
      cells: [
        { id: 'c1', type: 'markdown', content: '# Hello' },
        { id: 'w1', type: 'widget' },
        { id: 'c3', type: 'sql', content: 'select {{start_date}} as d;' },
      ],
    })
  })

  it('widget flow: imports widget cells and executes SQL with widget params', async () => {
    const importResponse = await invokeApi(notebookImportHandler, {
      method: 'POST',
      body: {
        mode: 'create',
        notebook: {
          spec_version: '1.0',
          title: 'Widget Notebook',
          cells: [
            {
              id: 'w1',
              type: 'widget',
              content: '',
              metadata: {
                widgetType: 'radio-group',
                key: 'status',
                label: 'Status',
                value: 'open',
                options: [
                  { label: 'Open', value: 'open' },
                  { label: 'Closed', value: 'closed' },
                ],
              },
            },
            {
              id: 'w2',
              type: 'widget',
              content: '',
              metadata: {
                widgetType: 'date-range',
                label: 'Date Range',
                value: { start: '2026-01-01', end: '2026-01-31' },
                config: { startKey: 'start_date', endKey: 'end_date' },
              },
            },
            {
              id: 'sql1',
              type: 'sql',
              content: 'select {{status}} as status, {{start_date}} as start_date, {{end_date}} as end_date;',
            },
          ],
        },
      },
    })

    expect(importResponse.statusCode).toBe(200)
    const notebookId = (importResponse.payload as { notebook_id: string }).notebook_id

    const exportResponse = await invokeApi(notebookExportHandler, {
      method: 'GET',
      query: { id: notebookId },
    })

    expect(exportResponse.statusCode).toBe(200)
    expect(exportResponse.payload).toMatchObject({
      title: 'Widget Notebook',
      cells: [
        {
          id: 'w1',
          type: 'widget',
          metadata: {
            widgetType: 'radio-group',
            key: 'status',
          },
        },
        {
          id: 'w2',
          type: 'widget',
          metadata: {
            widgetType: 'date-range',
            config: { startKey: 'start_date', endKey: 'end_date' },
          },
        },
        {
          id: 'sql1',
          type: 'sql',
        },
      ],
    })

    const runResponse = await invokeApi(runCellHandler, {
      method: 'POST',
      query: { id: notebookId },
      body: {
        cellId: 'sql1',
        query: 'select {{status}} as status, {{start_date}} as start_date, {{end_date}} as end_date;',
      },
    })

    expect(runResponse.statusCode).toBe(200)
    expect(vi.mocked(executeQuery)).toHaveBeenCalledWith(
      expect.objectContaining({
        values: ['open', '2026-01-01', '2026-01-31'],
      })
    )
  })

  it('patch flow: updates title and inserts markdown cell', async () => {
    const importResponse = await invokeApi(notebookImportHandler, {
      method: 'POST',
      body: {
        mode: 'create',
        notebook: {
          spec_version: '1.0',
          title: 'Patch Source',
          cells: [{ id: 'c1', type: 'markdown', content: '# A' }],
        },
      },
    })
    const notebookId = (importResponse.payload as { notebook_id: string }).notebook_id

    const patchResponse = await invokeApi(notebookPatchHandler, {
      method: 'POST',
      query: { id: notebookId },
      body: {
        spec_version: '1.0',
        ops: [
          { op: 'replace', path: '/title', value: 'Patch Target' },
          { op: 'add', path: '/cells/1', value: { id: 'c2', type: 'markdown', content: '## Added' } },
        ],
      },
    })

    expect(patchResponse.statusCode).toBe(200)
    expect(patchResponse.payload).toMatchObject({
      ok: true,
      notebook: {
        title: 'Patch Target',
        cells: [{ id: 'c1' }, { id: 'c2', content: '## Added' }],
      },
    })
  })

  it('import replace: overwrites the active notebook in place', async () => {
    const createResponse = await invokeApi(notebooksHandler, {
      method: 'POST',
      body: { title: 'Replace Me' },
    })
    const notebookId = (createResponse.payload as { item: { id: string } }).item.id

    const initialCellResponse = await invokeApi(notebookCellsHandler, {
      method: 'POST',
      query: { id: notebookId },
      body: { type: 'markdown', content: '# Old' },
    })
    expect(initialCellResponse.statusCode).toBe(200)

    const replaceResponse = await invokeApi(notebookImportHandler, {
      method: 'POST',
      body: {
        mode: 'replace',
        target_notebook_id: notebookId,
        notebook: {
          spec_version: '1.0',
          title: 'Replaced Notebook',
          description: 'new body',
          cells: [
            { id: 'sql-1', type: 'sql', content: 'select 42 as v;' },
            { id: 'md-1', type: 'markdown', content: '## Fresh' },
          ],
        },
      },
    })

    expect(replaceResponse.statusCode).toBe(200)
    expect(replaceResponse.payload).toMatchObject({
      ok: true,
      notebook_id: notebookId,
      notebook: {
        id: notebookId,
        title: 'Replaced Notebook',
        description: 'new body',
        cells: [{ id: 'sql-1' }, { id: 'md-1' }],
      },
    })

    const exportResponse = await invokeApi(notebookExportHandler, {
      method: 'GET',
      query: { id: notebookId },
    })

    expect(exportResponse.statusCode).toBe(200)
    expect(exportResponse.payload).toMatchObject({
      id: notebookId,
      title: 'Replaced Notebook',
      cells: [
        { id: 'sql-1', type: 'sql', content: 'select 42 as v;' },
        { id: 'md-1', type: 'markdown', content: '## Fresh' },
      ],
    })
  })

  it('import upsert: updates an existing notebook when the spec id already exists', async () => {
    const createResponse = await invokeApi(notebooksHandler, {
      method: 'POST',
      body: { title: 'Upsert Source' },
    })
    const notebookId = (createResponse.payload as { item: { id: string } }).item.id

    const upsertResponse = await invokeApi(notebookImportHandler, {
      method: 'POST',
      body: {
        mode: 'upsert',
        notebook: {
          spec_version: '1.0',
          id: notebookId,
          title: 'Upsert Target',
          cells: [{ id: 'md-1', type: 'markdown', content: '# Upserted' }],
        },
      },
    })

    expect(upsertResponse.statusCode).toBe(200)
    expect(upsertResponse.payload).toMatchObject({
      ok: true,
      notebook_id: notebookId,
      notebook: {
        id: notebookId,
        title: 'Upsert Target',
        cells: [{ id: 'md-1', content: '# Upserted' }],
      },
    })
  })

  it('import validate_only: validates and normalizes without persistence', async () => {
    const beforeCounts = sqlite
      .prepare(
        `
          SELECT
            (SELECT COUNT(*) FROM notebooks) AS notebooks_count,
            (SELECT COUNT(*) FROM notebook_cells) AS notebook_cells_count
        `
      )
      .get() as { notebooks_count: number; notebook_cells_count: number }

    const response = await invokeApi(notebookImportHandler, {
      method: 'POST',
      body: {
        mode: 'create',
        validate_only: true,
        notebook: {
          spec_version: '1.0',
          title: 'Validate-only Notebook',
          description: 'Should not persist',
          metadata: { source: 'vitest-validate-only' },
          cells: [
            { id: 'c2', type: 'markdown', position: 1, content: 'second' },
            { id: 'c1', type: 'markdown', position: 0, content: 'first' },
          ],
        },
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.payload).toMatchObject({
      ok: true,
      warnings: [],
      notebook: {
        spec_version: '1.0',
        title: 'Validate-only Notebook',
        description: 'Should not persist',
        metadata: { source: 'vitest-validate-only' },
        cells: [{ id: 'c1', position: 0 }, { id: 'c2', position: 1 }],
      },
    })

    const afterCounts = sqlite
      .prepare(
        `
          SELECT
            (SELECT COUNT(*) FROM notebooks) AS notebooks_count,
            (SELECT COUNT(*) FROM notebook_cells) AS notebook_cells_count
        `
      )
      .get() as { notebooks_count: number; notebook_cells_count: number }

    expect(afterCounts).toEqual(beforeCounts)
  })

  it('import validation failure: returns 422 with details', async () => {
    const response = await invokeApi(notebookImportHandler, {
      method: 'POST',
      body: {
        mode: 'create',
        notebook: {
          spec_version: '1.0',
          title: 'Bad Notebook',
          cells: [
            {
              id: 'widget-1',
              type: 'widget',
              content: '',
              metadata: {
                widgetType: 'text',
                key: '1bad',
                label: 'Invalid key',
                value: '',
              },
            },
          ],
        },
      },
    })

    expect(response.statusCode).toBe(422)
    expect(response.payload).toMatchObject({
      error: 'validation_failed',
      details: expect.arrayContaining([
        expect.objectContaining({
          path: '/notebook/cells/0/metadata/key',
        }),
      ]),
    })
  })
})
