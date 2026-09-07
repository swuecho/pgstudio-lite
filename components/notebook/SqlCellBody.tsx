import { memo, useCallback } from 'react'
import { SqlCellEditor } from './SqlCellEditor'
import { CellResult } from './CellResult'
import { toCompactSqlPreview } from './cellPresentation'
import type { NotebookInputDescriptor } from './notebookInputModel'
import type { QueryResult } from '../sql-editor/types'
import type { NotebookCell } from './types'
import styles from './NotebookPage.module.css'
import { copyTextToClipboard } from '@/lib/clipboard'

type SqlCellBodyProps = {
  cell: NotebookCell
  draft: string
  running: boolean
  runningAll: boolean
  queued: boolean
  staleResult: boolean
  saveError: string | undefined
  lastResult: QueryResult | undefined
  /** `{{key}}` template keys referenced by the draft SQL. */
  sqlKeys: string[]
  /** Subset of `sqlKeys` with no matching input cell. */
  missingSqlKeys: string[]
  notebookInputs: NotebookInputDescriptor[]
  selectedInsertParam: string
  onChange: (next: string) => void
  onRun: () => void
  onRunAndFocusNext: () => void
  onMountEditor: (editor: any) => void
  onUnmountEditor: () => void
  onSelectInsertParam: (event: React.ChangeEvent<HTMLSelectElement>) => void
  onInsertParam: () => void
  onJumpToInputCell: (key: string) => void
}

export const SqlCellBody = memo(function SqlCellBody({
  cell,
  draft,
  running,
  runningAll,
  queued,
  staleResult,
  saveError,
  lastResult,
  sqlKeys,
  missingSqlKeys,
  notebookInputs,
  selectedInsertParam,
  onChange,
  onRun,
  onRunAndFocusNext,
  onMountEditor,
  onUnmountEditor,
  onSelectInsertParam,
  onInsertParam,
  onJumpToInputCell,
}: SqlCellBodyProps) {
  if (!cell.collapsed) {
    return (
      <>
        <SqlCellEditor
          value={draft}
          disabled={running || runningAll}
          params={notebookInputs}
          onChange={onChange}
          onRun={onRun}
          onRunAndFocusNext={onRunAndFocusNext}
          onMountEditor={onMountEditor}
          onUnmountEditor={onUnmountEditor}
        />
        {notebookInputs.length ? (
          <div className={styles.paramControls}>
            <select className={styles.paramSelect} value={selectedInsertParam} onChange={onSelectInsertParam}>
              {notebookInputs.map((item) => (
                <option key={`${item.cellId}:${item.key}`} value={item.key}>
                  {item.key} ({item.inputType})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn small"
              disabled={!selectedInsertParam}
              onClick={onInsertParam}
            >
              Insert Param
            </button>
          </div>
        ) : null}
        {sqlKeys.length ? (
          <div className={styles.inputTags}>
            <span className="history-meta">Inputs:</span>
            {sqlKeys.map((key) => (
              <button
                key={key}
                type="button"
                className={`pill cursor-pointer appearance-none leading-[1.2] ${missingSqlKeys.includes(key) ? 'error' : 'ok'}`}
                onClick={() => onJumpToInputCell(key)}
                title={`Jump to input '${key}'`}
              >
                {key}
              </button>
            ))}
          </div>
        ) : null}
        <div className={styles.runRow}>
          <button
            className="btn small primary"
            disabled={running || runningAll || !draft.trim()}
            onClick={onRun}
          >
            {running ? 'Running...' : 'Run'}
          </button>
          <span className={`status-pill ${cell.last_run_status === 'error' ? 'error' : 'ok'}`}>
            {cell.last_run_status || 'idle'}
          </span>
          {queued ? <span className="history-meta">Queued...</span> : null}
          <span className="history-meta">
            {cell.last_duration_ms !== null ? `${cell.last_duration_ms}ms` : ''}
            {cell.last_row_count !== null ? ` · ${cell.last_row_count} rows` : ''}
          </span>
        </div>
        {saveError ? <div className="empty-state">Save failed: {saveError}</div> : null}
        {cell.last_error ? (
          <CellErrorPanel message={cell.last_error} busy={running || runningAll} onRetry={onRun} />
        ) : null}
        {staleResult ? (
          <div className="empty-state">Current SQL differs from the last executed query.</div>
        ) : null}
        {lastResult ? (
          <CellResult result={lastResult} notebookId={cell.notebook_id} cellId={cell.id} />
        ) : null}
      </>
    )
  }

  return (
    <>
      <div className={styles.sqlPreview}>{toCompactSqlPreview(draft)}</div>
      {saveError ? <div className="empty-state">Save failed: {saveError}</div> : null}
      {cell.last_error ? (
        <CellErrorPanel message={cell.last_error} busy={running || runningAll} onRetry={onRun} />
      ) : null}
      {staleResult ? <div className="empty-state">Result is stale until this cell is run again.</div> : null}
      {lastResult ? (
        <div className={styles.resultPreview}>
          <CellResult result={lastResult} notebookId={cell.notebook_id} cellId={cell.id} />
        </div>
      ) : (
        <div className="empty-state">Run this cell to show result preview.</div>
      )}
    </>
  )
})

type CellErrorPanelProps = {
  message: string
  busy: boolean
  onRetry: () => void
}

function CellErrorPanel({ message, busy, onRetry }: CellErrorPanelProps) {
  const handleCopy = useCallback(() => {
    void copyTextToClipboard(message)
  }, [message])
  return (
    <div className="cell-error" role="alert">
      <div className="cell-error-head">
        <span className="cell-error-title">Cell error</span>
        <div className="cell-error-actions">
          <button type="button" className="btn small" disabled={busy} onClick={onRetry}>
            Retry
          </button>
          <button type="button" className="btn small" onClick={handleCopy}>
            Copy
          </button>
        </div>
      </div>
      <pre className="cell-error-message">{message}</pre>
    </div>
  )
}
