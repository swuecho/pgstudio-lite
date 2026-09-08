import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { CellResult } from './CellResult'
import { WidgetCellEditor } from './WidgetCellEditor'
import { getResetWidgetValue, getWidgetParameterKeys, isSameValue } from './cellSyncHelpers'
import type { NotebookPageController } from './useNotebookPageState'
import type { NotebookCell, NotebookWidgetMetadata } from './types'
import styles from './NotebookPage.module.css'

type NotebookDashboardProps = {
  controller: NotebookPageController
}

/**
 * The consumer's view of a notebook. Every widget that drives a parameter, and
 * every action button, sits in a filter bar at the top; markdown, callouts and
 * query results follow as cards. Results that no longer match the current
 * parameters (or were never run) say so and can be run from the card, so a
 * viewer never has to switch back to the editor.
 */
export function NotebookDashboard({ controller }: NotebookDashboardProps) {
  const {
    activeNotebookId,
    sortedCells,
    resultsByCell,
    draftByCell,
    widgetDraftByCell,
    paramStaleByCell,
    cellUiStateByCell,
    runningAll,
    runningCellId,
    runAllSqlCells,
    runTargetSqlCells,
    updateParameterWidget,
    resetParameterWidget,
    resolvedOptionsByCell,
    refreshSqlOptions,
    validationMessagesByCell,
  } = controller

  if (!activeNotebookId) {
    return <div className="empty-state">Select a notebook to view its dashboard.</div>
  }

  const widgetMetadata = (cell: NotebookCell): NotebookWidgetMetadata | null =>
    cell.type === 'widget'
      ? (widgetDraftByCell[cell.id] ?? (cell.metadata_json as NotebookWidgetMetadata | null))
      : null

  const controls = sortedCells.flatMap((cell) => {
    const metadata = widgetMetadata(cell)
    if (!metadata || metadata.hidden) return []
    const isControl = metadata.widgetType === 'actions' || getWidgetParameterKeys(metadata).length > 0
    return isControl ? [{ cell, metadata }] : []
  })

  const cards = sortedCells.filter((cell) => {
    if (cell.type === 'markdown' || cell.type === 'sql') return true
    const metadata = widgetMetadata(cell)
    return Boolean(metadata && metadata.widgetType === 'callout' && !metadata.hidden)
  })

  const sqlCells = sortedCells.filter((cell) => cell.type === 'sql')
  const staleIds = sqlCells.filter((cell) => paramStaleByCell[cell.id]).map((cell) => cell.id)
  const notRunIds = sqlCells.filter((cell) => !resultsByCell[cell.id]).map((cell) => cell.id)
  const busy = runningAll || Boolean(runningCellId)

  if (cards.length === 0 && controls.length === 0) {
    return (
      <div className="empty-state">Nothing to show yet. Add SQL, Markdown or widget cells in the editor.</div>
    )
  }

  function triggerAction(metadata: NotebookWidgetMetadata) {
    if (metadata.config?.action === 'run-targets') {
      void runTargetSqlCells((metadata.config.targetCellIds || []) as string[])
      return
    }
    void runAllSqlCells()
  }

  return (
    <div className={styles.dashboardShell}>
      <div className={styles.dashboardToolbar}>
        <span>
          {sqlCells.length} {sqlCells.length === 1 ? 'query' : 'queries'}
        </span>
        {staleIds.length ? <span>· {staleIds.length} out of date</span> : null}
        {notRunIds.length ? <span>· {notRunIds.length} not run yet</span> : null}
        {busy ? <span>· Running...</span> : null}
        <div className={styles.dashboardToolbarActions}>
          {staleIds.length || notRunIds.length ? (
            <button
              type="button"
              className="btn small"
              disabled={busy}
              title="Run only the queries whose results are missing or out of date"
              onClick={() => void runTargetSqlCells([...new Set([...staleIds, ...notRunIds])])}
            >
              Run out of date ({new Set([...staleIds, ...notRunIds]).size})
            </button>
          ) : null}
          <button
            type="button"
            className="btn small primary"
            disabled={busy || sqlCells.length === 0}
            title="Run every query with the current parameters"
            onClick={() => void runAllSqlCells()}
          >
            {runningAll ? 'Running...' : 'Run all'}
          </button>
        </div>
      </div>

      {controls.length ? (
        <div className={styles.dashboardFilters} aria-label="Dashboard controls">
          {controls.map(({ cell, metadata }) => {
            const isAction = metadata.widgetType === 'actions'
            const compact = metadata.widgetType === 'radio-group' || metadata.widgetType === 'date-range'
            const label = metadata.label || metadata.key || (isAction ? 'Action' : 'Parameter')
            const resetValue = getResetWidgetValue(metadata)
            const canReset =
              !isAction && resetValue !== undefined && !isSameValue(resetValue, metadata.value ?? null)
            return (
              <div key={cell.id} className={styles.dashboardFilter}>
                <div className={styles.dashboardFilterHead}>
                  <span>{label}</span>
                  {metadata.required ? <span className="pill">required</span> : null}
                  {canReset ? (
                    <button
                      type="button"
                      className={`btn small ${styles.dashboardFilterReset}`}
                      title="Back to the default value"
                      onClick={() => resetParameterWidget(cell.id)}
                    >
                      Reset
                    </button>
                  ) : null}
                </div>
                <WidgetCellEditor
                  metadata={metadata}
                  disabled={runningAll || metadata.disabled}
                  valueOnly={!compact && !isAction}
                  inlineLabel={null}
                  collapsed={compact || isAction}
                  notebookId={activeNotebookId}
                  sqlOptionsState={resolvedOptionsByCell[cell.id]}
                  onRefreshSqlOptions={() => refreshSqlOptions(cell.id)}
                  validationMessages={validationMessagesByCell[cell.id]}
                  onChange={(next) => updateParameterWidget(cell.id, next)}
                  onTriggerAction={triggerAction}
                />
              </div>
            )
          })}
        </div>
      ) : null}

      <div className={styles.dashboardGrid}>
        {cards.map((cell) => {
          if (cell.type === 'markdown') {
            return (
              <div key={cell.id} className={`${styles.dashboardCard} ${styles.dashboardMarkdownCard}`}>
                <div className={styles.markdownPreview}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSanitize]}
                    components={{
                      a: ({ ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
                    }}
                  >
                    {draftByCell[cell.id] ?? cell.content}
                  </ReactMarkdown>
                </div>
              </div>
            )
          }

          if (cell.type === 'widget') {
            const metadata = widgetMetadata(cell)
            if (!metadata) return null
            return (
              <div key={cell.id} className={`${styles.dashboardCard} ${styles.dashboardCalloutCard}`}>
                <WidgetCellEditor metadata={metadata} collapsed onChange={() => undefined} />
              </div>
            )
          }

          const result = resultsByCell[cell.id]
          const uiState = cellUiStateByCell[cell.id] || 'idle'
          const running = uiState === 'running'
          const queued = uiState === 'queued'
          const stale = paramStaleByCell[cell.id] === true
          return (
            <div
              key={cell.id}
              className={[styles.dashboardCard, stale ? styles.dashboardCardStale : '']
                .filter(Boolean)
                .join(' ')}
            >
              <div className={styles.dashboardCardHead}>
                <span className={styles.dashboardCardTitle}>Query #{cell.position + 1}</span>
                {running ? (
                  <span className="pill">Running...</span>
                ) : queued ? (
                  <span className="pill">Queued</span>
                ) : cell.last_error ? (
                  <span className="pill error">Error</span>
                ) : stale ? (
                  <span className="pill" title="A parameter changed since this result was produced">
                    Out of date
                  </span>
                ) : !result ? (
                  <span className="pill">Not run yet</span>
                ) : null}
                {cell.last_run_at && !running ? (
                  <span>{new Date(cell.last_run_at).toLocaleString()}</span>
                ) : null}
                {result && !running ? <span>· {result.totalRows} rows</span> : null}
                <div className={styles.dashboardCardActions}>
                  <button
                    type="button"
                    className={`btn small ${stale || !result ? 'primary' : ''}`}
                    disabled={busy}
                    onClick={() => void runTargetSqlCells([cell.id])}
                    title="Run this query with the current parameters"
                  >
                    Run
                  </button>
                </div>
              </div>
              {cell.last_error ? <div className="cell-error-message">{cell.last_error}</div> : null}
              {result ? (
                <CellResult result={result} notebookId={cell.notebook_id} cellId={cell.id} hideToggle />
              ) : !cell.last_error ? (
                <div className="empty-state">Run this query to see its result here.</div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
