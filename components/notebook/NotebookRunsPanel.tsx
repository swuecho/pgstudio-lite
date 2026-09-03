import { useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { CellResult } from './CellResult'
import type { useNotebookRuns } from './useNotebookRuns'
import type { NotebookRunSnapshotCell, NotebookRunSummary } from './types'
import { formatScheduleInterval, NOTEBOOK_SCHEDULE_INTERVALS_MINUTES } from '@/lib/notebook-schedule-options'
import pageStyles from './NotebookPage.module.css'
import styles from './NotebookRunsPanel.module.css'

type NotebookRunsPanelProps = {
  notebookId: string
  notebookTitle: string
  runs: ReturnType<typeof useNotebookRuns>
  onClose: () => void
}

function formatWhen(iso: string | null) {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

function formatDuration(ms: number | null) {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

function statusPillClass(status: NotebookRunSummary['status']) {
  if (status === 'success') return 'pill ok'
  if (status === 'error') return 'pill error'
  return 'pill'
}

function widgetSummary(metadata: Record<string, unknown> | null) {
  if (!metadata) return null
  const label = typeof metadata.label === 'string' ? metadata.label : null
  const key = typeof metadata.key === 'string' ? metadata.key : null
  const value = 'value' in metadata ? metadata.value : undefined
  return { label: label || key || String(metadata.widgetType ?? 'widget'), key, value }
}

function SnapshotCell({ cell, notebookId }: { cell: NotebookRunSnapshotCell; notebookId: string }) {
  if (cell.type === 'markdown') {
    return (
      <div className={styles.snapshotCell}>
        <div className={styles.snapshotCellHead}>
          <span className="pill">MD</span>
          <span>#{cell.position + 1}</span>
        </div>
        <div className={pageStyles.markdownPreview}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {cell.content}
          </ReactMarkdown>
        </div>
      </div>
    )
  }

  if (cell.type === 'widget') {
    const summary = widgetSummary(cell.metadata)
    return (
      <div className={styles.snapshotCell}>
        <div className={styles.snapshotCellHead}>
          <span className="pill">WGT</span>
          <span>#{cell.position + 1}</span>
        </div>
        {summary ? (
          <div className={styles.widgetValue}>
            {summary.label}
            {summary.key ? (
              <>
                {' · '}
                <code>{summary.key}</code> = <code>{JSON.stringify(summary.value ?? null)}</code>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className={styles.snapshotCell}>
      <div className={styles.snapshotCellHead}>
        <span className="pill">SQL</span>
        <span>#{cell.position + 1}</span>
        {cell.status ? (
          <span className={statusPillClass(cell.status === 'skipped' ? 'running' : cell.status)}>
            {cell.status}
          </span>
        ) : null}
        {cell.duration_ms !== null ? <span>{formatDuration(cell.duration_ms)}</span> : null}
      </div>
      <pre className={styles.sqlText}>{cell.content}</pre>
      {cell.error ? <div className={styles.cellError}>{cell.error}</div> : null}
      {cell.result ? (
        <CellResult result={cell.result} notebookId={notebookId} cellId={`run:${cell.id}`} hideToggle />
      ) : null}
    </div>
  )
}

export function NotebookRunsPanel({ notebookId, notebookTitle, runs, onClose }: NotebookRunsPanelProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const schedule = runs.schedule
  const selected = runs.selectedRun

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Notebook runs">
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <strong>Runs · {notebookTitle}</strong>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn small primary"
              disabled={runs.runNowPending}
              onClick={runs.runNow}
              title="Run every SQL cell now and keep the results as a snapshot"
            >
              {runs.runNowPending ? 'Running...' : 'Run now'}
            </button>
            <button type="button" className="btn small" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className={styles.scheduleBar}>
          <label>
            <input
              type="checkbox"
              checked={schedule?.enabled ?? false}
              disabled={!schedule || runs.schedulePending}
              onChange={(event) =>
                runs.updateSchedule({
                  enabled: event.target.checked,
                  intervalMinutes: schedule?.interval_minutes ?? 60,
                })
              }
            />
            Run on a schedule
          </label>
          <select
            aria-label="Schedule interval"
            value={schedule?.interval_minutes ?? 60}
            disabled={!schedule || runs.schedulePending}
            onChange={(event) =>
              runs.updateSchedule({
                enabled: schedule?.enabled ?? false,
                intervalMinutes: Number(event.target.value),
              })
            }
          >
            {NOTEBOOK_SCHEDULE_INTERVALS_MINUTES.map((minutes) => (
              <option key={minutes} value={minutes}>
                {formatScheduleInterval(minutes)}
              </option>
            ))}
          </select>
          {schedule?.enabled ? (
            <span className={styles.scheduleMeta}>Next run {formatWhen(schedule.next_run_at)}</span>
          ) : null}
          {schedule?.last_run_at ? (
            <span className={styles.scheduleMeta}>Last scheduled run {formatWhen(schedule.last_run_at)}</span>
          ) : null}
          <span className={styles.scheduleSpacer} />
          <span className={styles.scheduleMeta}>
            Scheduled runs happen only while PG Studio Lite is open.
          </span>
        </div>

        <div className={styles.body}>
          <div className={styles.runList} aria-label="Run history">
            {runs.runsLoading ? <div className="empty-state">Loading runs...</div> : null}
            {!runs.runsLoading && runs.runs.length === 0 ? (
              <div className="empty-state">No runs yet. Use Run now, or enable a schedule.</div>
            ) : null}
            {runs.runs.map((run) => (
              <button
                key={run.id}
                type="button"
                className={`${styles.runItem} ${run.id === runs.selectedRunId ? styles.runItemActive : ''}`}
                aria-pressed={run.id === runs.selectedRunId}
                onClick={() => runs.setSelectedRunId(run.id)}
              >
                <div className={styles.runItemTop}>
                  <span className={statusPillClass(run.status)}>{run.status}</span>
                  <span>{formatWhen(run.started_at)}</span>
                </div>
                <div className={styles.runItemMeta}>
                  {run.trigger} · {formatDuration(run.duration_ms)} · {run.cell_count} cell(s)
                  {run.error_count ? ` · ${run.error_count} failed` : ''}
                </div>
              </button>
            ))}
          </div>

          <div className={styles.detail}>
            {!runs.selectedRunId ? (
              <div className={styles.emptyDetail}>Select a run to see the snapshot it captured.</div>
            ) : runs.selectedRunLoading || !selected ? (
              <div className="empty-state">Loading run...</div>
            ) : (
              <>
                <div className={styles.detailHead}>
                  <span className={statusPillClass(selected.status)}>{selected.status}</span>
                  <span>
                    {selected.trigger} run · started {formatWhen(selected.started_at)} ·{' '}
                    {formatDuration(selected.duration_ms)} · connection {selected.connection_name}
                  </span>
                  {selected.error ? <span className={styles.cellError}>{selected.error}</span> : null}
                  <span className="spacer" style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="btn small danger"
                    onClick={() => runs.deleteRun(selected.id)}
                  >
                    Delete run
                  </button>
                </div>
                {selected.cells.map((cell) => (
                  <SnapshotCell key={cell.id} cell={cell} notebookId={notebookId} />
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
