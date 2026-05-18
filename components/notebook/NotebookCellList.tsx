import { memo, useCallback, useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { SqlCellEditor } from './SqlCellEditor'
import { WidgetCellEditor } from './WidgetCellEditor'
import { ErrorBoundary } from '../shared/ErrorBoundary'
import type { NotebookPageController } from './useNotebookPageState'
import { formatCell } from '../sql-editor/utils'
import type { QueryResult } from '../sql-editor/types'
import type { NotebookCell } from './types'
import type { NotebookWidgetMetadata } from '../../lib/notebook-widgets'
import { extractTemplateKeys } from '../../lib/notebook-params'
import styles from './NotebookPage.module.css'

type NotebookCellListProps = {
  controller: NotebookPageController
}

export function NotebookCellList({ controller }: NotebookCellListProps) {
  const {
    activeNotebookId,
    clearPendingCellAction,
    detailQuery,
    pendingCellAction,
    sortedCells,
  } = controller

  const scrollRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: sortedCells.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const cell = sortedCells[index]
      if (!cell) return 200
      if (cell.collapsed) return 60
      if (cell.type === 'widget') return 150
      if (cell.type === 'markdown') return 120
      return 250
    },
    overscan: 5,
  })

  useEffect(() => {
    if (!pendingCellAction) return
    const targetIndex = sortedCells.findIndex((cell) => cell.id === pendingCellAction.cellId)
    if (targetIndex === -1) {
      clearPendingCellAction()
      return
    }
    virtualizer.scrollToIndex(targetIndex, { align: 'center' })
  }, [clearPendingCellAction, pendingCellAction, sortedCells, virtualizer])

  if (!activeNotebookId) {
    return <div className="empty-state">Create a notebook to begin.</div>
  }
  if (detailQuery.isLoading) {
    return <div className="empty-state">Loading notebook...</div>
  }
  if (sortedCells.length === 0) {
    return <div className="empty-state">No cells yet. Add SQL, Widget, or Markdown cells.</div>
  }

  return (
    <div ref={scrollRef} className={styles.cells}>
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const cell = sortedCells[virtualItem.index]
          if (!cell) return null
          return (
            <div
              key={cell.id}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <ErrorBoundary fallbackTitle={`Cell "${cell.id}" failed to render`}>
                <MemoizedNotebookCellRow
                  cell={cell}
                  controller={controller}
                />
              </ErrorBoundary>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- Memoized cell row ---

type NotebookCellRowProps = {
  cell: NotebookCell
  controller: NotebookPageController
}

const MemoizedNotebookCellRow = memo(function NotebookCellRow({ cell, controller }: NotebookCellRowProps) {
  const {
    cellUiStateByCell,
    draftByCell,
    inputValues,
    inputKeys,
    jumpToInputCell,
    moveCell,
    notebookInputs,
    onChangeCell,
    onWidgetMetadataChange,
    previewMarkdown,
    resultsByCell,
    runTargetSqlCells,
    runningAll,
    runningCellId,
    runSqlCellWithShortcuts,
    saveErrorByCell,
    selectedCellId,
    selectedInsertParamByCell,
    setPreviewMarkdown,
    setSelectedCellId,
    setSelectedInsertParamByCell,
    sortedCells,
    staleResultByCell,
    sqlEditorRefs,
    toggleCellCollapsed,
    deleteCellById,
    duplicateWidgetCellById,
    cellSectionRefs,
    pendingCellAction,
    clearPendingCellAction,
    insertParamIntoSqlCell,
    widgetDraftByCell,
  } = controller

  const draft = draftByCell[cell.id] ?? cell.content
  const lastResult = resultsByCell[cell.id]
  const running = runningCellId === cell.id
  const staleResult = staleResultByCell[cell.id] === true
  const cellUiState = cellUiStateByCell[cell.id] || 'idle'
  const queued = cellUiState === 'queued'
  const saveError = saveErrorByCell[cell.id]
  const sqlKeys = cell.type === 'sql' ? extractTemplateKeys(draft) : []
  const missingSqlKeys = sqlKeys.filter((key) => !inputKeys.has(key))
  const selectedInsertParam = selectedInsertParamByCell[cell.id] || notebookInputs[0]?.key || ''
  const availableSqlTargets = sortedCells
    .filter((item) => item.type === 'sql' && item.id !== cell.id)
    .map((item) => ({
      id: item.id,
      label: `#${item.position + 1} ${toCompactSqlPreview(draftByCell[item.id] ?? item.content)}`,
    }))

  const handleMouseDown = useCallback(() => setSelectedCellId(cell.id), [cell.id, setSelectedCellId])
  const handleFocusCapture = useCallback(() => setSelectedCellId(cell.id), [cell.id, setSelectedCellId])
  const handleRef = useCallback((element: HTMLElement | null) => {
    cellSectionRefs.current[cell.id] = element
  }, [cell.id, cellSectionRefs])
  const handleChange = useCallback((next: string) => onChangeCell(cell, next), [cell, onChangeCell])
  const handleRun = useCallback(() => { void runSqlCellWithShortcuts(cell, false) }, [cell, runSqlCellWithShortcuts])
  const handleRunAndFocusNext = useCallback(() => { void runSqlCellWithShortcuts(cell, true) }, [cell, runSqlCellWithShortcuts])
  const handleMountEditorAndFocus = useCallback((editor: any) => {
    sqlEditorRefs.current[cell.id] = editor
    if (pendingCellAction?.cellId === cell.id && pendingCellAction.target === 'editor') {
      editor.focus()
      clearPendingCellAction(cell.id)
    }
  }, [cell.id, clearPendingCellAction, pendingCellAction, sqlEditorRefs])
  const handleUnmountEditor = useCallback(() => { delete sqlEditorRefs.current[cell.id] }, [cell.id, sqlEditorRefs])
  const handleToggleCollapsed = useCallback(() => toggleCellCollapsed(cell), [cell, toggleCellCollapsed])
  const handleDuplicate = useCallback(() => duplicateWidgetCellById(cell.id), [cell.id, duplicateWidgetCellById])
  const handleMoveUp = useCallback(() => moveCell(cell, 'up'), [cell, moveCell])
  const handleMoveDown = useCallback(() => moveCell(cell, 'down'), [cell, moveCell])
  const handleDelete = useCallback(() => deleteCellById(cell.id), [cell.id, deleteCellById])
  const handleWidgetChange = useCallback((next: NotebookWidgetMetadata) => onWidgetMetadataChange(cell, next as any), [cell, onWidgetMetadataChange])
  const handleInsertParam = useCallback(() => insertParamIntoSqlCell(cell, selectedInsertParam), [cell, insertParamIntoSqlCell, selectedInsertParam])
  const handleRefreshSqlOptions = useCallback(() => controller.refreshSqlOptions(cell.id), [controller, cell.id])

  const handleTriggerAction = useCallback((metadata: NotebookWidgetMetadata) => {
    const action = metadata.config?.action || 'run-all'
    if (action === 'run-targets') {
      const ids = (metadata.config?.targetCellIds || []) as string[]
      void runTargetSqlCells(ids)
      return
    }
    void controller.runAllSqlCells()
  }, [controller, runTargetSqlCells])

  const handleSelectInsertParam = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedInsertParamByCell((prev) => ({ ...prev, [cell.id]: event.target.value }))
  }, [cell.id, setSelectedInsertParamByCell])

  const handleToggleMarkdownPreview = useCallback(() => {
    setPreviewMarkdown((prev) => ({
      ...prev,
      [cell.id]: !(prev[cell.id] ?? false),
    }))
  }, [cell.id, setPreviewMarkdown])

  const handleMarkdownChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChangeCell(cell, event.target.value)
  }, [cell, onChangeCell])

  useEffect(() => {
    if (pendingCellAction?.cellId !== cell.id) return

    if (pendingCellAction.target === 'control') {
      const section = cellSectionRefs.current[cell.id]
      if (!section) return
      const control = section.querySelector('input, select, textarea') as HTMLElement | null
      control?.focus()
      clearPendingCellAction(cell.id)
      return
    }

    const editor = sqlEditorRefs.current[cell.id]
    if (!editor) return
    editor.focus()
    clearPendingCellAction(cell.id)
  }, [cell.id, cellSectionRefs, clearPendingCellAction, pendingCellAction, sqlEditorRefs])

  return (
    <section
      ref={handleRef}
      onMouseDown={handleMouseDown}
      onFocusCapture={handleFocusCapture}
      className={[
        styles.cell,
        cell.type === 'widget' ? styles.widgetCell : '',
        selectedCellId === cell.id ? styles.cellSelected : '',
        cell.collapsed ? styles.cellCollapsed : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={[styles.cellHead, cell.collapsed ? styles.cellHeadCompact : ''].filter(Boolean).join(' ')}>
        <span className="pill">
          {cell.type === 'markdown' ? 'MD' : cell.type === 'widget' ? 'WGT' : 'SQL'}
        </span>
        <span className="history-meta">#{cell.position + 1}</span>
        {cell.last_run_at ? <span className="history-meta">Last run: {new Date(cell.last_run_at).toLocaleString()}</span> : null}
        <span className="history-meta">{formatCellUiState(cellUiState)}</span>
        <div className={styles.cellActions}>
          <button
            className="btn small icon-btn"
            onClick={handleToggleCollapsed}
            title={cell.collapsed ? 'Edit mode' : 'Preview mode'}
            aria-label={cell.collapsed ? 'Edit mode' : 'Preview mode'}
          >
            {cell.collapsed ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 20h4l10-10-4-4L4 16v4Zm13.7-11.3 1.6-1.6a1 1 0 0 0 0-1.4l-1.3-1.3a1 1 0 0 0-1.4 0L15 6l2.7 2.7Z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
              </svg>
            )}
          </button>
          {!cell.collapsed ? (
            <>
              {cell.type === 'widget' ? (
                <button className="btn small" onClick={handleDuplicate}>
                  Duplicate
                </button>
              ) : null}
              <button className="btn small" onClick={handleMoveUp}>
                Up
              </button>
              <button className="btn small" onClick={handleMoveDown}>
                Down
              </button>
              <button className="btn small" onClick={handleDelete}>
                Delete
              </button>
            </>
          ) : null}
        </div>
      </div>

      {cell.type === 'sql' ? (
        <SqlCellBody
          cell={cell}
          draft={draft}
          running={running}
          runningAll={runningAll}
          queued={queued}
          staleResult={staleResult}
          saveError={saveError}
          lastResult={lastResult}
          sqlKeys={sqlKeys}
          missingSqlKeys={missingSqlKeys}
          notebookInputs={notebookInputs}
          selectedInsertParam={selectedInsertParam}
          onChange={handleChange}
          onRun={handleRun}
          onRunAndFocusNext={handleRunAndFocusNext}
          onMountEditor={handleMountEditorAndFocus}
          onUnmountEditor={handleUnmountEditor}
          onSelectInsertParam={handleSelectInsertParam}
          onInsertParam={handleInsertParam}
          onJumpToInputCell={jumpToInputCell}
        />
      ) : cell.type === 'widget' ? (
        <WidgetCellBody
          cell={cell}
          controller={controller}
          widgetDraft={widgetDraftByCell[cell.id] || (cell.metadata_json as any)}
          runningAll={runningAll}
          collapsed={cell.collapsed}
          inputValues={inputValues}
          availableSqlTargets={availableSqlTargets}
          onRefreshSqlOptions={handleRefreshSqlOptions}
          onChange={handleWidgetChange}
          onTriggerAction={handleTriggerAction}
        />
      ) : (
        <MarkdownCellBody
          cell={cell}
          draft={draft}
          previewMarkdown={previewMarkdown[cell.id]}
          onTogglePreview={handleToggleMarkdownPreview}
          onChange={handleMarkdownChange}
        />
      )}
    </section>
  )
})

// --- Cell error panel ---

type CellErrorPanelProps = {
  message: string
  busy: boolean
  onRetry: () => void
}

function CellErrorPanel({ message, busy, onRetry }: CellErrorPanelProps) {
  const handleCopy = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    void navigator.clipboard.writeText(message).catch(() => {})
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

// --- SQL cell body ---

type SqlCellBodyProps = {
  cell: NotebookCell
  draft: string
  running: boolean
  runningAll: boolean
  queued: boolean
  staleResult: boolean
  saveError: string | undefined
  lastResult: QueryResult | undefined
  sqlKeys: string[]
  missingSqlKeys: string[]
  notebookInputs: Array<{ key: string; label: string; inputType: string }>
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

const SqlCellBody = memo(function SqlCellBody({
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
            <select
              className={styles.paramSelect}
              value={selectedInsertParam}
              onChange={onSelectInsertParam}
            >
              {notebookInputs.map((item) => (
                <option key={item.key} value={item.key}>
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
        {staleResult ? <div className="empty-state">Current SQL differs from the last executed query.</div> : null}
        {lastResult ? <CellResult result={lastResult} /> : null}
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
          <CellResult result={lastResult} />
        </div>
      ) : (
        <div className="empty-state">Run this cell to show result preview.</div>
      )}
    </>
  )
})

// --- Widget cell body ---

type WidgetCellBodyProps = {
  cell: NotebookCell
  controller: NotebookPageController
  widgetDraft: NotebookWidgetMetadata
  runningAll: boolean
  collapsed: boolean
  inputValues: Record<string, unknown>
  availableSqlTargets: Array<{ id: string; label: string }>
  onRefreshSqlOptions: () => void
  onChange: (next: NotebookWidgetMetadata) => void
  onTriggerAction: (metadata: NotebookWidgetMetadata) => void
}

const WidgetCellBody = memo(function WidgetCellBody({
  cell,
  controller,
  widgetDraft,
  runningAll,
  collapsed,
  inputValues,
  availableSqlTargets,
  onRefreshSqlOptions,
  onChange,
  onTriggerAction,
}: WidgetCellBodyProps) {
  const sharedProps = {
    metadata: widgetDraft as any,
    disabled: runningAll,
    notebookId: controller.activeNotebookId,
    inputValues,
    sqlOptionsState: controller.resolvedOptionsByCell[cell.id],
    onRefreshSqlOptions,
    validationMessages: controller.validationMessagesByCell[cell.id],
    availableSqlTargets,
    onChange,
  }

  if (!collapsed) {
    return (
      <WidgetCellEditor
        {...sharedProps}
        onTriggerAction={onTriggerAction}
      />
    )
  }

  return (
    <WidgetCellEditor
      {...sharedProps}
      collapsed
    />
  )
})

// --- Markdown cell body ---

type MarkdownCellBodyProps = {
  cell: NotebookCell
  draft: string
  previewMarkdown: boolean | undefined
  onTogglePreview: () => void
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
}

const MarkdownCellBody = memo(function MarkdownCellBody({
  cell,
  draft,
  previewMarkdown,
  onTogglePreview,
  onChange,
}: MarkdownCellBodyProps) {
  return (
    <>
      {!cell.collapsed ? (
        <div className={styles.markdownActions}>
          <button className="btn small" onClick={onTogglePreview}>
            {previewMarkdown ? 'Edit' : 'Preview'}
          </button>
        </div>
      ) : null}
      {cell.collapsed || previewMarkdown ? (
        <div
          className={[styles.markdownShell, cell.collapsed ? styles.markdownShellCollapsed : '']
            .filter(Boolean)
            .join(' ')}
        >
          <MarkdownPreview source={draft} />
        </div>
      ) : (
        <textarea
          className={styles.markdownTextarea}
          value={draft}
          onChange={onChange}
        />
      )}
    </>
  )
})

// --- Shared sub-components ---

const CellResult = memo(function CellResult({ result }: { result: QueryResult }) {
  return (
    <div className="results-stack">
      {result.statements.map((statement, index) => (
        <div key={`${statement.command}-${index}`} className="result-block">
          <div className="result-block-head">
            <span>#{index + 1}</span>
            <span>{statement.command}</span>
            <span>{statement.rowCount} rows</span>
          </div>
          {statement.fields.length === 0 ? (
            <div className="empty-state">Command executed successfully.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {statement.fields.map((field) => (
                      <th key={field}>{field}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {statement.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {statement.fields.map((field) => (
                        <td key={`${rowIndex}-${field}`}>
                          <code>{formatCell(row[field])}</code>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
})

function toCompactSqlPreview(sql: string) {
  const flattened = sql.replace(/\s+/g, ' ').trim()
  if (!flattened) return '-- Empty SQL cell --'
  return flattened.length > 180 ? `${flattened.slice(0, 180)}...` : flattened
}

function formatCellUiState(state: 'idle' | 'saving' | 'save_failed' | 'queued' | 'running' | 'stale_result') {
  if (state === 'saving') return 'Saving...'
  if (state === 'save_failed') return 'Save failed'
  if (state === 'queued') return 'Queued'
  if (state === 'running') return 'Running...'
  if (state === 'stale_result') return 'Result is stale'
  return 'Idle'
}

const MarkdownPreview = memo(function MarkdownPreview({ source }: { source: string }) {
  return (
    <div className={styles.markdownPreview}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
          code: ({ className, children, ...props }) => {
            const isBlock = Boolean(className)
            if (!isBlock) return <code {...props}>{children}</code>
            return (
              <pre className={styles.markdownCodeBlock}>
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            )
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
})
