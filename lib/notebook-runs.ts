import { randomUUID } from 'node:crypto'
import { and, desc, eq, lte } from 'drizzle-orm'
import { notebookRuns, notebookSchedules } from '../drizzle/schema'
import { getMetaDb } from './meta-db'
import { getNotebookById, runNotebookSqlCell } from './notebook-db'
import { getWidgetParamValues, isWidgetMetadata } from './notebook-widgets'
import { isAllowedScheduleInterval, NOTEBOOK_SCHEDULE_INTERVALS_MINUTES } from './notebook-schedule-options'
import type {
  NotebookRunDetail,
  NotebookRunSnapshotCell,
  NotebookRunStatus,
  NotebookRunSummary,
  NotebookRunTrigger,
  NotebookSchedule,
} from './notebook-types'

/** Runs kept per notebook; older ones are pruned after each new run. */
export const NOTEBOOK_RUN_RETENTION = 50

function httpError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode?: number }
  error.statusCode = statusCode
  return error
}

// A run holds the notebook exclusively: "Run now" while a scheduled run is in
// flight (or vice versa) gets a 409 instead of interleaved cell writes. Kept on
// globalThis so the dev server's separate module graphs share one set.
const RUN_LOCKS = Symbol.for('pgstudio.notebookRunLocks')
type GlobalWithLocks = typeof globalThis & { [RUN_LOCKS]?: Set<string> }
function runLocks(): Set<string> {
  const g = globalThis as GlobalWithLocks
  if (!g[RUN_LOCKS]) g[RUN_LOCKS] = new Set()
  return g[RUN_LOCKS]
}

export function isNotebookRunInProgress(notebookId: string) {
  return runLocks().has(notebookId)
}

function toRunSummary(row: typeof notebookRuns.$inferSelect): NotebookRunSummary {
  return {
    id: row.id,
    notebook_id: row.notebookId,
    trigger: row.trigger as NotebookRunTrigger,
    status: row.status as NotebookRunStatus,
    started_at: row.startedAt,
    finished_at: row.finishedAt,
    duration_ms: row.durationMs,
    cell_count: row.cellCount,
    error_count: row.errorCount,
    error: row.error,
  }
}

function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

function toRunDetail(row: typeof notebookRuns.$inferSelect): NotebookRunDetail {
  return {
    ...toRunSummary(row),
    notebook_title: row.notebookTitle,
    connection_name: row.connectionName,
    input_values: parseJson<Record<string, unknown>>(row.inputValuesJson, {}),
    cells: parseJson<NotebookRunSnapshotCell[]>(row.snapshotJson, []),
  }
}

export function listNotebookRuns(notebookId: string, limit = NOTEBOOK_RUN_RETENTION): NotebookRunSummary[] {
  return getMetaDb()
    .select()
    .from(notebookRuns)
    .where(eq(notebookRuns.notebookId, notebookId))
    .orderBy(desc(notebookRuns.startedAt))
    .limit(Math.max(1, Math.min(200, limit)))
    .all()
    .map(toRunSummary)
}

export function getNotebookRun(notebookId: string, runId: string): NotebookRunDetail | null {
  const row = getMetaDb()
    .select()
    .from(notebookRuns)
    .where(and(eq(notebookRuns.id, runId), eq(notebookRuns.notebookId, notebookId)))
    .get()
  return row ? toRunDetail(row) : null
}

export function deleteNotebookRun(notebookId: string, runId: string) {
  const result = getMetaDb()
    .delete(notebookRuns)
    .where(and(eq(notebookRuns.id, runId), eq(notebookRuns.notebookId, notebookId)))
    .run()
  return result.changes > 0
}

export function pruneNotebookRuns(notebookId: string, keep = NOTEBOOK_RUN_RETENTION) {
  // SQLite needs a LIMIT to accept OFFSET, so take the ordered ids and slice.
  const stale = getMetaDb()
    .select({ id: notebookRuns.id })
    .from(notebookRuns)
    .where(eq(notebookRuns.notebookId, notebookId))
    .orderBy(desc(notebookRuns.startedAt))
    .all()
    .slice(Math.max(0, keep))
  for (const row of stale) {
    getMetaDb().delete(notebookRuns).where(eq(notebookRuns.id, row.id)).run()
  }
  return stale.length
}

/**
 * Execute every SQL cell of a notebook in order and persist the outcome as one
 * run. Unlike the editor's Run All, a failing cell does not stop the run: a
 * report is more useful with the cells that did work, so each cell records its
 * own success or error and the run is 'error' if any cell failed.
 *
 * Cells go through runNotebookSqlCell, so their last_result/last_error columns
 * (what the editor shows) are updated exactly as if the user had pressed Run.
 */
export async function runNotebookSnapshot(input: {
  notebookId: string
  trigger: NotebookRunTrigger
}): Promise<NotebookRunDetail> {
  const detail = getNotebookById(input.notebookId)
  if (!detail) throw httpError('notebook not found', 404)

  const locks = runLocks()
  if (locks.has(input.notebookId)) throw httpError('a run is already in progress for this notebook', 409)
  locks.add(input.notebookId)

  const runId = randomUUID()
  const startedAt = new Date()
  const inputValues: Record<string, unknown> = {}
  for (const cell of detail.cells) {
    if (cell.type !== 'widget' || !cell.metadata_json || !isWidgetMetadata(cell.metadata_json)) continue
    Object.assign(inputValues, getWidgetParamValues(cell.metadata_json))
  }

  getMetaDb()
    .insert(notebookRuns)
    .values({
      id: runId,
      notebookId: input.notebookId,
      trigger: input.trigger,
      status: 'running',
      startedAt: startedAt.toISOString(),
      cellCount: detail.cells.length,
      notebookTitle: detail.notebook.title,
      connectionName: detail.notebook.connection_name,
      inputValuesJson: JSON.stringify(inputValues),
    })
    .run()

  const cells: NotebookRunSnapshotCell[] = []
  let errorCount = 0
  try {
    for (const cell of [...detail.cells].sort((a, b) => a.position - b.position)) {
      const base = {
        id: cell.id,
        position: cell.position,
        type: cell.type,
        content: cell.content,
        metadata: (cell.metadata_json as Record<string, unknown> | null) ?? null,
      }
      if (cell.type !== 'sql') {
        cells.push({ ...base, status: null, duration_ms: null, result: null, error: null })
        continue
      }
      const query = cell.content.trim()
      if (!query) {
        cells.push({ ...base, status: 'skipped', duration_ms: null, result: null, error: null })
        continue
      }
      const cellStarted = Date.now()
      try {
        const result = await runNotebookSqlCell({
          notebookId: input.notebookId,
          cellId: cell.id,
          query,
          inputValues,
        })
        cells.push({ ...base, status: 'success', duration_ms: Date.now() - cellStarted, result, error: null })
      } catch (error) {
        errorCount += 1
        cells.push({
          ...base,
          status: 'error',
          duration_ms: Date.now() - cellStarted,
          result: null,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const finishedAt = new Date()
    getMetaDb()
      .update(notebookRuns)
      .set({
        status: errorCount > 0 ? 'error' : 'success',
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        errorCount,
        error: errorCount > 0 ? `${errorCount} of ${cells.length} cell(s) failed` : null,
        snapshotJson: JSON.stringify(cells),
      })
      .where(eq(notebookRuns.id, runId))
      .run()
  } catch (error) {
    // Only infrastructure failures land here (cell errors are captured above).
    const finishedAt = new Date()
    getMetaDb()
      .update(notebookRuns)
      .set({
        status: 'error',
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        errorCount,
        error: error instanceof Error ? error.message : String(error),
        snapshotJson: JSON.stringify(cells),
      })
      .where(eq(notebookRuns.id, runId))
      .run()
    throw error
  } finally {
    locks.delete(input.notebookId)
  }

  pruneNotebookRuns(input.notebookId)
  const stored = getNotebookRun(input.notebookId, runId)
  if (!stored) throw httpError('run vanished while executing', 500)
  return stored
}

// ---- Schedules ----------------------------------------------------------------

function toSchedule(row: typeof notebookSchedules.$inferSelect): NotebookSchedule {
  return {
    notebook_id: row.notebookId,
    enabled: row.enabled,
    interval_minutes: row.intervalMinutes,
    next_run_at: row.nextRunAt,
    last_run_at: row.lastRunAt,
    last_run_id: row.lastRunId,
    updated_at: row.updatedAt,
  }
}

export function defaultNotebookSchedule(notebookId: string): NotebookSchedule {
  return {
    notebook_id: notebookId,
    enabled: false,
    interval_minutes: 60,
    next_run_at: null,
    last_run_at: null,
    last_run_id: null,
    updated_at: null,
  }
}

export function getNotebookSchedule(notebookId: string): NotebookSchedule {
  const row = getMetaDb()
    .select()
    .from(notebookSchedules)
    .where(eq(notebookSchedules.notebookId, notebookId))
    .get()
  return row ? toSchedule(row) : defaultNotebookSchedule(notebookId)
}

export { NOTEBOOK_SCHEDULE_INTERVALS_MINUTES }

export function upsertNotebookSchedule(
  notebookId: string,
  input: { enabled: boolean; intervalMinutes: number },
  now = new Date()
): NotebookSchedule {
  if (!getNotebookById(notebookId)) throw httpError('notebook not found', 404)
  if (!isAllowedScheduleInterval(input.intervalMinutes)) {
    throw httpError(`intervalMinutes must be one of ${NOTEBOOK_SCHEDULE_INTERVALS_MINUTES.join(', ')}`, 400)
  }

  const existing = getMetaDb()
    .select()
    .from(notebookSchedules)
    .where(eq(notebookSchedules.notebookId, notebookId))
    .get()
  const nowIso = now.toISOString()
  // Enabling (or changing the interval while enabled) restarts the clock from now.
  const nextRunAt = input.enabled
    ? new Date(now.getTime() + input.intervalMinutes * 60_000).toISOString()
    : null

  if (existing) {
    getMetaDb()
      .update(notebookSchedules)
      .set({ enabled: input.enabled, intervalMinutes: input.intervalMinutes, nextRunAt, updatedAt: nowIso })
      .where(eq(notebookSchedules.notebookId, notebookId))
      .run()
  } else {
    getMetaDb()
      .insert(notebookSchedules)
      .values({
        notebookId,
        enabled: input.enabled,
        intervalMinutes: input.intervalMinutes,
        nextRunAt,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run()
  }
  return getNotebookSchedule(notebookId)
}

export function listDueNotebookSchedules(now = new Date()): NotebookSchedule[] {
  return getMetaDb()
    .select()
    .from(notebookSchedules)
    .where(and(eq(notebookSchedules.enabled, true), lte(notebookSchedules.nextRunAt, now.toISOString())))
    .all()
    .map(toSchedule)
}

/** Advance a schedule after a tick, whether or not the run itself succeeded. */
export function advanceNotebookSchedule(
  notebookId: string,
  input: { runId: string | null },
  now = new Date()
) {
  const schedule = getNotebookSchedule(notebookId)
  const nowIso = now.toISOString()
  getMetaDb()
    .update(notebookSchedules)
    .set({
      lastRunAt: nowIso,
      lastRunId: input.runId,
      nextRunAt: new Date(now.getTime() + schedule.interval_minutes * 60_000).toISOString(),
      updatedAt: nowIso,
    })
    .where(eq(notebookSchedules.notebookId, notebookId))
    .run()
  return getNotebookSchedule(notebookId)
}
