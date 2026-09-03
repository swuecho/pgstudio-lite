import {
  advanceNotebookSchedule,
  isNotebookRunInProgress,
  listDueNotebookSchedules,
  runNotebookSnapshot,
} from './notebook-runs'

/**
 * Runs due notebook schedules while the app is up.
 *
 * There is deliberately no daemon: in web mode the Next server starts the
 * ticker from instrumentation.ts, in the desktop app the Electron main process
 * starts it after the metadata DB is ready. A schedule whose time passed while
 * nothing was running fires on the first tick after start-up.
 *
 * State lives on globalThis so a dev server that evaluates this module in more
 * than one bundle still owns exactly one interval.
 */
export const NOTEBOOK_SCHEDULER_TICK_MS = 30_000

type SchedulerState = {
  timer: ReturnType<typeof setInterval> | null
  ticking: boolean
}
const STATE = Symbol.for('pgstudio.notebookScheduler')
type GlobalWithState = typeof globalThis & { [STATE]?: SchedulerState }
function state(): SchedulerState {
  const g = globalThis as GlobalWithState
  if (!g[STATE]) g[STATE] = { timer: null, ticking: false }
  return g[STATE]
}

export type ScheduledTickResult = {
  due: number
  ran: string[]
  skipped: string[]
  failed: Array<{ notebookId: string; error: string }>
}

/**
 * One pass over due schedules, sequentially so two heavy notebooks never
 * compete for the same connection pool. Exported for tests and callable
 * without starting the interval.
 */
export async function runDueNotebookSchedules(now = new Date()): Promise<ScheduledTickResult> {
  const due = listDueNotebookSchedules(now)
  const result: ScheduledTickResult = { due: due.length, ran: [], skipped: [], failed: [] }

  for (const schedule of due) {
    // A manual run is in flight: leave next_run_at alone and retry next tick.
    if (isNotebookRunInProgress(schedule.notebook_id)) {
      result.skipped.push(schedule.notebook_id)
      continue
    }
    try {
      const run = await runNotebookSnapshot({ notebookId: schedule.notebook_id, trigger: 'scheduled' })
      advanceNotebookSchedule(schedule.notebook_id, { runId: run.id }, new Date())
      result.ran.push(schedule.notebook_id)
    } catch (error) {
      // Still advance, or a notebook that cannot run (deleted connection, say)
      // would be retried every tick forever.
      advanceNotebookSchedule(schedule.notebook_id, { runId: null }, new Date())
      result.failed.push({
        notebookId: schedule.notebook_id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return result
}

async function tick() {
  const current = state()
  if (current.ticking) return
  current.ticking = true
  try {
    const outcome = await runDueNotebookSchedules()
    for (const failure of outcome.failed) {
      console.error(`[notebook-scheduler] run failed for notebook ${failure.notebookId}: ${failure.error}`)
    }
  } catch (error) {
    console.error('[notebook-scheduler] tick failed', error)
  } finally {
    current.ticking = false
  }
}

export function startNotebookScheduler(options: { tickMs?: number } = {}) {
  const current = state()
  if (current.timer) return false
  const timer = setInterval(() => void tick(), options.tickMs ?? NOTEBOOK_SCHEDULER_TICK_MS)
  // Never keep the process alive just for the scheduler.
  if (typeof timer === 'object' && timer && 'unref' in timer) timer.unref()
  current.timer = timer
  return true
}

export function stopNotebookScheduler() {
  const current = state()
  if (!current.timer) return false
  clearInterval(current.timer)
  current.timer = null
  return true
}

export function isNotebookSchedulerRunning() {
  return state().timer !== null
}
