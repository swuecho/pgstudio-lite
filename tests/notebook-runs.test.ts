import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import runsHandler from '../pages/api/notebooks/[id]/runs'
import runByIdHandler from '../pages/api/notebooks/[id]/runs/[runId]'
import scheduleHandler from '../pages/api/notebooks/[id]/schedule'
import { ensureMetaDbReady, getSqlite } from '../lib/meta-db'
import { executeQuery } from '../lib/db'
import { createNotebook, createNotebookCell, deleteNotebook, getNotebookById } from '../lib/notebook-db'
import {
  getNotebookSchedule,
  listDueNotebookSchedules,
  listNotebookRuns,
  pruneNotebookRuns,
  runNotebookSnapshot,
  upsertNotebookSchedule,
} from '../lib/notebook-runs'
import { runDueNotebookSchedules } from '../lib/notebook-scheduler'

vi.mock('../lib/db', () => ({
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
}))

const okResult = {
  statements: [
    {
      command: 'SELECT',
      rowCount: 1,
      returnedRowCount: 1,
      truncated: false,
      fields: ['v'],
      rows: [{ v: 1 }],
    },
  ],
  totalRows: 1,
  durationMs: 5,
}

type ApiResult = { statusCode: number; payload: unknown }

async function invokeApi(
  handler: (req: never, res: never) => unknown,
  input: { method: string; query?: Record<string, unknown>; body?: unknown }
): Promise<ApiResult> {
  let statusCode = 200
  let payload: unknown = null
  const req = { method: input.method, query: input.query || {}, body: input.body }
  const res = {
    setHeader() {},
    status(code: number) {
      statusCode = code
      return this
    },
    json(body: unknown) {
      payload = body
      return this
    },
  }
  await handler(req as never, res as never)
  return { statusCode, payload }
}

function resetFixtures() {
  ensureMetaDbReady()
  getSqlite().exec(`
    DELETE FROM notebook_runs;
    DELETE FROM notebook_schedules;
    DELETE FROM notebook_cells;
    DELETE FROM notebooks;
    DELETE FROM query_history;
  `)
}

/** Notebook with a widget, a SQL cell using it, a second SQL cell, and a markdown cell. */
function makeNotebookFixture() {
  const notebook = createNotebook({ title: 'Report' })
  createNotebookCell({
    notebookId: notebook.id,
    type: 'widget',
    content: '',
    metadata: { widgetType: 'text', key: 'region', label: 'Region', value: 'emea', autoRun: true },
  })
  const first = createNotebookCell({
    notebookId: notebook.id,
    type: 'sql',
    content: 'select {{region}} as r',
  })
  const second = createNotebookCell({ notebookId: notebook.id, type: 'sql', content: 'select 2' })
  createNotebookCell({ notebookId: notebook.id, type: 'markdown', content: '## Notes' })
  return { notebookId: notebook.id, firstSqlId: first.id, secondSqlId: second.id }
}

describe('notebook runs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T10:00:00.000Z'))
    resetFixtures()
    vi.mocked(executeQuery).mockResolvedValue(okResult as never)
  })

  afterEach(() => {
    resetFixtures()
    vi.useRealTimers()
  })

  it('captures every cell, keeps going past a failing cell, and marks the run as error', async () => {
    const { notebookId, firstSqlId, secondSqlId } = makeNotebookFixture()
    vi.mocked(executeQuery)
      .mockRejectedValueOnce(new Error('relation "nope" does not exist'))
      .mockResolvedValueOnce(okResult as never)

    const run = await runNotebookSnapshot({ notebookId, trigger: 'manual' })

    expect(run).toMatchObject({
      trigger: 'manual',
      status: 'error',
      cell_count: 4,
      error_count: 1,
      error: '1 of 4 cell(s) failed',
      notebook_title: 'Report',
      connection_name: 'default',
      input_values: { region: 'emea' },
    })
    expect(run.cells.map((cell) => [cell.type, cell.status])).toEqual([
      ['widget', null],
      ['sql', 'error'],
      ['sql', 'success'],
      ['markdown', null],
    ])
    expect(run.cells[1].error).toContain('does not exist')
    expect(run.cells[2].result).toEqual(okResult)
    expect(run.cells[3].content).toBe('## Notes')

    // The widget value was compiled into the failing query's parameters.
    expect(vi.mocked(executeQuery).mock.calls[0][0]).toMatchObject({ values: ['emea'] })

    // Cells reflect the run exactly as if the user had pressed Run.
    const detail = getNotebookById(notebookId)!
    const byId = new Map(detail.cells.map((cell) => [cell.id, cell]))
    expect(byId.get(firstSqlId)?.last_run_status).toBe('error')
    expect(byId.get(secondSqlId)?.last_run_status).toBe('success')
  })

  it('skips empty SQL cells and reports success when nothing failed', async () => {
    const notebook = createNotebook({ title: 'Empty-ish' })
    createNotebookCell({ notebookId: notebook.id, type: 'sql', content: '   ' })
    createNotebookCell({ notebookId: notebook.id, type: 'sql', content: 'select 1' })

    const run = await runNotebookSnapshot({ notebookId: notebook.id, trigger: 'scheduled' })
    expect(run.status).toBe('success')
    expect(run.cells.map((cell) => cell.status)).toEqual(['skipped', 'success'])
    expect(executeQuery).toHaveBeenCalledTimes(1)
  })

  it('lists newest first and prunes beyond the retention count', async () => {
    const { notebookId } = makeNotebookFixture()
    for (let i = 0; i < 3; i += 1) {
      vi.setSystemTime(new Date(`2026-03-01T10:0${i}:00.000Z`))
      await runNotebookSnapshot({ notebookId, trigger: 'manual' })
    }
    const before = listNotebookRuns(notebookId)
    expect(before.map((run) => run.started_at)).toEqual([
      '2026-03-01T10:02:00.000Z',
      '2026-03-01T10:01:00.000Z',
      '2026-03-01T10:00:00.000Z',
    ])

    expect(pruneNotebookRuns(notebookId, 2)).toBe(1)
    expect(listNotebookRuns(notebookId).map((run) => run.started_at)).toEqual([
      '2026-03-01T10:02:00.000Z',
      '2026-03-01T10:01:00.000Z',
    ])
  })

  it('refuses a second run while one is in progress', async () => {
    const { notebookId } = makeNotebookFixture()
    let release: () => void = () => {}
    vi.mocked(executeQuery).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(okResult as never)
        })
    )

    const first = runNotebookSnapshot({ notebookId, trigger: 'manual' })
    await Promise.resolve()
    await expect(runNotebookSnapshot({ notebookId, trigger: 'scheduled' })).rejects.toMatchObject({
      statusCode: 409,
    })

    release()
    await expect(first).resolves.toMatchObject({ status: 'success' })
    // Lock released: a new run is accepted.
    await expect(runNotebookSnapshot({ notebookId, trigger: 'manual' })).resolves.toMatchObject({
      status: 'success',
    })
  })

  it('deleting the notebook removes its runs and schedule', async () => {
    const { notebookId } = makeNotebookFixture()
    await runNotebookSnapshot({ notebookId, trigger: 'manual' })
    upsertNotebookSchedule(notebookId, { enabled: true, intervalMinutes: 15 })

    deleteNotebook(notebookId)

    expect(getSqlite().prepare('select count(*) as n from notebook_runs').get()).toEqual({ n: 0 })
    expect(getSqlite().prepare('select count(*) as n from notebook_schedules').get()).toEqual({ n: 0 })
  })
})

describe('notebook schedules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T10:00:00.000Z'))
    resetFixtures()
    vi.mocked(executeQuery).mockResolvedValue(okResult as never)
  })

  afterEach(() => {
    resetFixtures()
    vi.useRealTimers()
  })

  it('reads as disabled until set, and enabling starts the clock from now', () => {
    const { notebookId } = makeNotebookFixture()
    expect(getNotebookSchedule(notebookId)).toMatchObject({
      enabled: false,
      interval_minutes: 60,
      next_run_at: null,
    })

    const enabled = upsertNotebookSchedule(notebookId, { enabled: true, intervalMinutes: 15 })
    expect(enabled).toMatchObject({
      enabled: true,
      interval_minutes: 15,
      next_run_at: '2026-03-01T10:15:00.000Z',
    })

    const disabled = upsertNotebookSchedule(notebookId, { enabled: false, intervalMinutes: 15 })
    expect(disabled.next_run_at).toBeNull()
  })

  it('rejects intervals outside the allowed set and unknown notebooks', () => {
    const { notebookId } = makeNotebookFixture()
    expect(() => upsertNotebookSchedule(notebookId, { enabled: true, intervalMinutes: 7 })).toThrow(
      /intervalMinutes must be one of/
    )
    expect(() => upsertNotebookSchedule('missing', { enabled: true, intervalMinutes: 5 })).toThrowError(
      expect.objectContaining({ statusCode: 404 })
    )
  })

  it('a tick runs only due schedules and advances them', async () => {
    const due = makeNotebookFixture()
    const notDue = createNotebook({ title: 'Later' })
    createNotebookCell({ notebookId: notDue.id, type: 'sql', content: 'select 1' })
    upsertNotebookSchedule(due.notebookId, { enabled: true, intervalMinutes: 5 })
    upsertNotebookSchedule(notDue.id, { enabled: true, intervalMinutes: 1440 })

    vi.setSystemTime(new Date('2026-03-01T10:06:00.000Z'))
    expect(listDueNotebookSchedules().map((s) => s.notebook_id)).toEqual([due.notebookId])

    const outcome = await runDueNotebookSchedules()
    expect(outcome).toMatchObject({ due: 1, ran: [due.notebookId], skipped: [], failed: [] })

    const runs = listNotebookRuns(due.notebookId)
    expect(runs).toHaveLength(1)
    expect(runs[0].trigger).toBe('scheduled')

    const schedule = getNotebookSchedule(due.notebookId)
    expect(schedule.last_run_id).toBe(runs[0].id)
    expect(schedule.last_run_at).toBe('2026-03-01T10:06:00.000Z')
    expect(schedule.next_run_at).toBe('2026-03-01T10:11:00.000Z')
    expect(listNotebookRuns(notDue.id)).toHaveLength(0)
  })

  it('advances a schedule even when the run cannot start, so it is not retried every tick', async () => {
    const { notebookId } = makeNotebookFixture()
    upsertNotebookSchedule(notebookId, { enabled: true, intervalMinutes: 5 })
    // Simulate the notebook vanishing between listing and running.
    getSqlite().exec(`PRAGMA foreign_keys = OFF; DELETE FROM notebooks; PRAGMA foreign_keys = ON;`)

    vi.setSystemTime(new Date('2026-03-01T10:06:00.000Z'))
    const outcome = await runDueNotebookSchedules()
    expect(outcome.failed).toEqual([{ notebookId, error: 'notebook not found' }])
    expect(getNotebookSchedule(notebookId).next_run_at).toBe('2026-03-01T10:11:00.000Z')
  })
})

describe('notebook runs API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetFixtures()
    vi.mocked(executeQuery).mockResolvedValue(okResult as never)
  })

  afterEach(() => resetFixtures())

  it('runs, lists, reads, and deletes through the handlers', async () => {
    const { notebookId } = makeNotebookFixture()

    const created = await invokeApi(runsHandler, { method: 'POST', query: { id: notebookId } })
    expect(created.statusCode).toBe(200)
    const runId = (created.payload as { item: { id: string; status: string } }).item.id
    expect((created.payload as { item: { status: string } }).item.status).toBe('success')

    const listed = await invokeApi(runsHandler, { method: 'GET', query: { id: notebookId } })
    expect((listed.payload as { items: unknown[] }).items).toHaveLength(1)

    const read = await invokeApi(runByIdHandler, { method: 'GET', query: { id: notebookId, runId } })
    expect(read.statusCode).toBe(200)
    expect((read.payload as { item: { cells: unknown[] } }).item.cells).toHaveLength(4)

    const deleted = await invokeApi(runByIdHandler, { method: 'DELETE', query: { id: notebookId, runId } })
    expect(deleted.payload).toEqual({ ok: true })
    const gone = await invokeApi(runByIdHandler, { method: 'GET', query: { id: notebookId, runId } })
    expect(gone.statusCode).toBe(404)
  })

  it('returns 404 for an unknown notebook and 405 for unsupported methods', async () => {
    expect((await invokeApi(runsHandler, { method: 'GET', query: { id: 'nope' } })).statusCode).toBe(404)
    expect((await invokeApi(runsHandler, { method: 'POST', query: { id: 'nope' } })).statusCode).toBe(404)
    expect((await invokeApi(scheduleHandler, { method: 'GET', query: { id: 'nope' } })).statusCode).toBe(404)
    expect((await invokeApi(runsHandler, { method: 'PATCH', query: { id: 'x' } })).statusCode).toBe(405)
  })

  it('validates and stores the schedule', async () => {
    const { notebookId } = makeNotebookFixture()
    const bad = await invokeApi(scheduleHandler, {
      method: 'PUT',
      query: { id: notebookId },
      body: { enabled: true, intervalMinutes: 7 },
    })
    expect(bad.statusCode).toBe(400)

    const ok = await invokeApi(scheduleHandler, {
      method: 'PUT',
      query: { id: notebookId },
      body: { enabled: true, intervalMinutes: 30 },
    })
    expect(ok.statusCode).toBe(200)
    expect((ok.payload as { item: { enabled: boolean; interval_minutes: number } }).item).toMatchObject({
      enabled: true,
      interval_minutes: 30,
    })

    const read = await invokeApi(scheduleHandler, { method: 'GET', query: { id: notebookId } })
    expect((read.payload as { item: { enabled: boolean } }).item.enabled).toBe(true)
  })
})
