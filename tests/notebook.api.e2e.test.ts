import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invokeApi } from './helpers/invoke-api'
import notebooksHandler from '../pages/api/notebooks/index'
import notebookCellsHandler from '../pages/api/notebooks/[id]/cells'
import runCellHandler from '../pages/api/notebooks/[id]/run-cell'
import optionQueryHandler from '../pages/api/notebooks/[id]/option-query'
import notebookExportHandler from '../pages/api/notebooks/[id]/export'
import notebookPatchHandler from '../pages/api/notebooks/[id]/patch'
import notebookImportHandler from '../pages/api/notebooks/import'
import { ensureMetaDbReady, getSqlite } from '../lib/meta-db'
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

function resetNotebookFixtures() {
  ensureMetaDbReady()
  getSqlite().exec(`
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

  it('run cell flow: reports the compiled query and bound values it sent to Postgres', async () => {
    const notebookId = await createNotebookFixture('Notebook C2')
    const widgetResponse = await invokeApi(notebookCellsHandler, {
      method: 'POST',
      query: { id: notebookId },
      body: {
        type: 'widget',
        content: '',
        metadata: { widgetType: 'text', key: 'org', label: 'Organization', value: 'from-widget' },
      },
    })
    expect(widgetResponse.statusCode).toBe(200)
    const cellResponse = await invokeApi(notebookCellsHandler, {
      method: 'POST',
      query: { id: notebookId },
      body: { type: 'sql', content: 'select 1;' },
    })
    const cellId = (cellResponse.payload as { item: { id: string } }).item.id
    const query = 'select * from distribution_stores where organization_id = {{org}} and status = {{status}}'

    const response = await invokeApi(runCellHandler, {
      method: 'POST',
      query: { id: notebookId },
      body: { cellId, query, inputValues: { status: '' } },
    })

    expect(response.statusCode).toBe(200)
    expect(vi.mocked(executeQuery)).toHaveBeenCalledWith({
      query: 'select * from distribution_stores where organization_id = $1 and status = $2',
      connectionName: 'default',
      values: ['from-widget', ''],
    })
    expect(response.payload).toMatchObject({
      executedQuery: {
        text: 'select * from distribution_stores where organization_id = $1 and status = $2',
        values: ['from-widget', ''],
        params: [
          { key: 'org', placeholder: '$1', value: 'from-widget', valueType: 'string', source: 'widget' },
          {
            key: 'status',
            placeholder: '$2',
            value: '',
            valueType: 'string',
            source: 'request',
            warning: 'Value is an empty string.',
          },
        ],
      },
    })

    const stored = getSqlite()
      .prepare('select last_result_json from notebook_cells where id = ?')
      .get(cellId) as { last_result_json: string }
    expect(JSON.parse(stored.last_result_json).executedQuery.values).toEqual(['from-widget', ''])
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

  it('option query flow: executes notebook-scoped option query without cell id', async () => {
    const notebookId = await createNotebookFixture('Notebook Options')

    const response = await invokeApi(optionQueryHandler, {
      method: 'POST',
      query: { id: notebookId },
      body: {
        query: 'select {{status}} as value;',
        inputValues: { status: 'open' },
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.payload).toMatchObject({
      totalRows: 1,
      durationMs: 5,
    })
    expect(vi.mocked(executeQuery)).toHaveBeenCalledTimes(1)
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
    const beforeCounts = getSqlite()
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
        cells: [
          { id: 'c1', position: 0 },
          { id: 'c2', position: 1 },
        ],
      },
    })

    const afterCounts = getSqlite()
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

  it('import create: remaps cell ids already used by another notebook and follows action targets', async () => {
    const spec = {
      spec_version: '1.0',
      title: 'Docs example',
      cells: [
        { id: 'md_intro', type: 'markdown', content: '# Intro' },
        { id: 'sql_1', type: 'sql', content: 'select 1;' },
        {
          id: 'run_btn',
          type: 'widget',
          content: '',
          metadata: {
            widgetType: 'actions',
            label: 'Run',
            config: { action: 'run-targets', targetCellIds: ['sql_1'] },
          },
        },
      ],
    }

    const first = await invokeApi(notebookImportHandler, {
      method: 'POST',
      body: { mode: 'create', notebook: spec },
    })
    expect(first.statusCode).toBe(200)
    expect((first.payload as { warnings: string[] }).warnings).toEqual([])

    const second = await invokeApi(notebookImportHandler, {
      method: 'POST',
      body: { mode: 'create', notebook: spec },
    })
    expect(second.statusCode).toBe(200)
    const payload = second.payload as {
      notebook_id: string
      warnings: string[]
      notebook: { cells: Array<{ id: string; metadata?: { config?: { targetCellIds?: string[] } } }> }
    }
    expect(payload.notebook_id).not.toBe((first.payload as { notebook_id: string }).notebook_id)
    expect(payload.warnings).toHaveLength(3)
    expect(payload.warnings[0]).toMatch(/cell id 'md_intro' is already used by another notebook/)

    const ids = payload.notebook.cells.map((cell) => cell.id)
    expect(ids).not.toContain('md_intro')
    expect(ids).not.toContain('sql_1')
    expect(new Set(ids).size).toBe(3)
    // The actions widget now points at the remapped SQL cell, not the other notebook's.
    expect(payload.notebook.cells[2].metadata?.config?.targetCellIds).toEqual([ids[1]])

    // The first notebook is untouched and keeps its readable ids.
    const firstExport = await invokeApi(notebookExportHandler, {
      method: 'GET',
      query: { id: (first.payload as { notebook_id: string }).notebook_id },
    })
    expect((firstExport.payload as { cells: Array<{ id: string }> }).cells.map((cell) => cell.id)).toEqual([
      'md_intro',
      'sql_1',
      'run_btn',
    ])
  })

  it('import validate_only: reports the id remap it would perform without writing anything', async () => {
    const spec = {
      spec_version: '1.0',
      title: 'Validate collisions',
      cells: [{ id: 'shared_id', type: 'markdown', content: '# A' }],
    }
    await invokeApi(notebookImportHandler, { method: 'POST', body: { mode: 'create', notebook: spec } })

    const response = await invokeApi(notebookImportHandler, {
      method: 'POST',
      body: { mode: 'create', validate_only: true, notebook: spec },
    })
    expect(response.statusCode).toBe(200)
    const payload = response.payload as { warnings: string[]; notebook: { cells: Array<{ id: string }> } }
    expect(payload.warnings).toHaveLength(1)
    expect(payload.notebook.cells[0].id).not.toBe('shared_id')
    expect(getSqlite().prepare('SELECT count(*) AS n FROM notebooks').get()).toEqual({ n: 1 })
  })

  it('patch flow: keeps stored results on cells the patch did not remove', async () => {
    const importResponse = await invokeApi(notebookImportHandler, {
      method: 'POST',
      body: {
        mode: 'create',
        notebook: {
          spec_version: '1.0',
          title: 'Before',
          cells: [
            { id: 'sql-keep', type: 'sql', content: 'select 1 as v;' },
            { id: 'sql-edit', type: 'sql', content: 'select 2 as v;' },
            { id: 'sql-to-md', type: 'sql', content: 'select 3 as v;' },
            { id: 'sql-drop', type: 'sql', content: 'select 4 as v;' },
          ],
        },
      },
    })
    const notebookId = (importResponse.payload as { notebook_id: string }).notebook_id

    for (const cellId of ['sql-keep', 'sql-edit', 'sql-to-md', 'sql-drop']) {
      const runResponse = await invokeApi(runCellHandler, {
        method: 'POST',
        query: { id: notebookId },
        body: { cellId, query: 'select 1;' },
      })
      expect(runResponse.statusCode).toBe(200)
    }

    const patchResponse = await invokeApi(notebookPatchHandler, {
      method: 'POST',
      query: { id: notebookId },
      body: {
        spec_version: '1.0',
        ops: [
          { op: 'replace', path: '/title', value: 'After' },
          { op: 'replace', path: '/cells/1/content', value: 'select 20 as v;' },
          { op: 'replace', path: '/cells/2/type', value: 'markdown' },
          { op: 'remove', path: '/cells/3' },
          { op: 'add', path: '/cells/0', value: { id: 'md-new', type: 'markdown', content: '# New' } },
        ],
      },
    })
    expect(patchResponse.statusCode).toBe(200)

    const cells = getSqlite()
      .prepare(
        'SELECT id, position, type, content, last_run_status, last_result_json IS NOT NULL AS has_result FROM notebook_cells WHERE notebook_id = ? ORDER BY position'
      )
      .all(notebookId)
    expect(cells).toEqual([
      { id: 'md-new', position: 0, type: 'markdown', content: '# New', last_run_status: null, has_result: 0 },
      {
        id: 'sql-keep',
        position: 1,
        type: 'sql',
        content: 'select 1 as v;',
        last_run_status: 'success',
        has_result: 1,
      },
      // Edited SQL keeps its (now stale) result, like an edit in the editor does.
      {
        id: 'sql-edit',
        position: 2,
        type: 'sql',
        content: 'select 20 as v;',
        last_run_status: 'success',
        has_result: 1,
      },
      // A type change drops the SQL result.
      {
        id: 'sql-to-md',
        position: 3,
        type: 'markdown',
        content: 'select 3 as v;',
        last_run_status: null,
        has_result: 0,
      },
    ])
    expect((patchResponse.payload as { notebook: { title: string } }).notebook.title).toBe('After')
  })

  it('import replace: reorders surviving cells without tripping the unique position index', async () => {
    const importResponse = await invokeApi(notebookImportHandler, {
      method: 'POST',
      body: {
        mode: 'create',
        notebook: {
          spec_version: '1.0',
          title: 'Order',
          cells: [
            { id: 'a', type: 'markdown', content: 'a' },
            { id: 'b', type: 'markdown', content: 'b' },
            { id: 'c', type: 'markdown', content: 'c' },
          ],
        },
      },
    })
    const notebookId = (importResponse.payload as { notebook_id: string }).notebook_id

    const replaceResponse = await invokeApi(notebookImportHandler, {
      method: 'POST',
      body: {
        mode: 'replace',
        target_notebook_id: notebookId,
        notebook: {
          spec_version: '1.0',
          title: 'Order',
          cells: [
            { id: 'c', type: 'markdown', content: 'c' },
            { id: 'a', type: 'markdown', content: 'a' },
            { id: 'b', type: 'markdown', content: 'b' },
          ],
        },
      },
    })
    expect(replaceResponse.statusCode).toBe(200)
    expect(
      (replaceResponse.payload as { notebook: { cells: Array<{ id: string; position: number }> } }).notebook
        .cells
    ).toEqual([
      expect.objectContaining({ id: 'c', position: 0 }),
      expect.objectContaining({ id: 'a', position: 1 }),
      expect.objectContaining({ id: 'b', position: 2 }),
    ])
  })

  it('cell type change: converting a SQL cell to Markdown drops its run columns and keeps the text', async () => {
    const notebookId = await createNotebookFixture()
    const addResponse = await invokeApi(notebookCellsHandler, {
      method: 'POST',
      query: { id: notebookId },
      body: { type: 'sql', content: 'select 1 as v;' },
    })
    const cellId = (addResponse.payload as { item: { id: string } }).item.id

    const runResponse = await invokeApi(runCellHandler, {
      method: 'POST',
      query: { id: notebookId },
      body: { cellId, query: 'select 1 as v;' },
    })
    expect(runResponse.statusCode).toBe(200)

    const convertResponse = await invokeApi(notebookCellsHandler, {
      method: 'PATCH',
      query: { id: notebookId },
      body: { cellId, type: 'markdown', content: 'select 1 as v; -- now a note' },
    })
    expect(convertResponse.statusCode).toBe(200)
    expect((convertResponse.payload as { item: unknown }).item).toMatchObject({
      type: 'markdown',
      content: 'select 1 as v; -- now a note',
      last_run_status: null,
      last_run_at: null,
      last_row_count: null,
      last_result_json: null,
      last_error: null,
    })

    // Converting back does not resurrect anything; the cell simply has no run yet.
    const backResponse = await invokeApi(notebookCellsHandler, {
      method: 'PATCH',
      query: { id: notebookId },
      body: { cellId, type: 'sql' },
    })
    expect((backResponse.payload as { item: unknown }).item).toMatchObject({
      type: 'sql',
      last_run_status: null,
      last_result_json: null,
    })
  })
})
