import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { SqlCellEditor } from './SqlCellEditor'
import { WidgetCellEditor } from './WidgetCellEditor'
import type { NotebookPageController } from './useNotebookPageState'
import { formatCell } from '../sql-editor/utils'
import type { QueryResult } from '../sql-editor/types'
import { extractTemplateKeys } from '../../lib/notebook-params'
import styles from './NotebookPage.module.css'

type NotebookCellListProps = {
  controller: NotebookPageController
}

export function NotebookCellList({ controller }: NotebookCellListProps) {
  const {
    activeNotebookId,
    cellUiStateByCell,
    detailQuery,
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
    cellSectionRefs,
    insertParamIntoSqlCell,
    widgetDraftByCell,
  } = controller

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
    <>
      {sortedCells.map((cell) => {
        const draft = draftByCell[cell.id] ?? cell.content
        const lastResult = resultsByCell[cell.id]
        const running = runningCellId === cell.id
        const staleResult = staleResultByCell[cell.id] === true
        const cellUiState = cellUiStateByCell[cell.id] || 'idle'
        const saving = cellUiState === 'saving'
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
        return (
          <section
            key={cell.id}
            ref={(element) => {
              cellSectionRefs.current[cell.id] = element
            }}
            onMouseDown={() => setSelectedCellId(cell.id)}
            onFocusCapture={() => setSelectedCellId(cell.id)}
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
                  onClick={() => toggleCellCollapsed(cell)}
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
                    <button className="btn small" onClick={() => moveCell(cell, 'up')}>
                      Up
                    </button>
                    <button className="btn small" onClick={() => moveCell(cell, 'down')}>
                      Down
                    </button>
                    <button className="btn small" onClick={() => deleteCellById(cell.id)}>
                      Delete
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {cell.type === 'sql' ? (
              <>
                {!cell.collapsed ? (
                  <>
                    <SqlCellEditor
                      value={draft}
                      disabled={running || runningAll}
                      params={notebookInputs}
                      onChange={(next) => onChangeCell(cell, next)}
                      onRun={() => {
                        void runSqlCellWithShortcuts(cell, false)
                      }}
                      onRunAndFocusNext={() => {
                        void runSqlCellWithShortcuts(cell, true)
                      }}
                      onMountEditor={(editor) => {
                        sqlEditorRefs.current[cell.id] = editor
                      }}
                      onUnmountEditor={() => {
                        delete sqlEditorRefs.current[cell.id]
                      }}
                    />
                    {notebookInputs.length ? (
                      <div className={styles.paramControls}>
                        <select
                          className={styles.paramSelect}
                          value={selectedInsertParam}
                          onChange={(event) =>
                            setSelectedInsertParamByCell((prev) => ({ ...prev, [cell.id]: event.target.value }))
                          }
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
                          onClick={() => insertParamIntoSqlCell(cell, selectedInsertParam)}
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
                            onClick={() => jumpToInputCell(key)}
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
                        onClick={() => {
                          void runSqlCellWithShortcuts(cell, false)
                        }}
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
                    {cell.last_error ? <div className="empty-state">{cell.last_error}</div> : null}
                    {staleResult ? <div className="empty-state">Current SQL differs from the last executed query.</div> : null}
                    {lastResult ? <CellResult result={lastResult} /> : null}
                  </>
                ) : (
                  <>
                    <div className={styles.sqlPreview}>{toCompactSqlPreview(draft)}</div>
                    {saveError ? <div className="empty-state">Save failed: {saveError}</div> : null}
                    {cell.last_error ? <div className="empty-state">{cell.last_error}</div> : null}
                    {staleResult ? <div className="empty-state">Result is stale until this cell is run again.</div> : null}
                    {lastResult ? (
                      <div className={styles.resultPreview}>
                        <CellResult result={lastResult} />
                      </div>
                    ) : (
                      <div className="empty-state">Run this cell to show result preview.</div>
                    )}
                  </>
                )}
              </>
            ) : cell.type === 'widget' ? (
              <>
                {!cell.collapsed ? (
                  <WidgetCellEditor
                    metadata={widgetDraftByCell[cell.id] || (cell.metadata_json as any)}
                    disabled={runningAll}
                    notebookId={activeNotebookId}
                    inputValues={inputValues}
                    availableSqlTargets={availableSqlTargets}
                    onChange={(next) => onWidgetMetadataChange(cell, next)}
                    onTriggerAction={(metadata) => {
                      const action = metadata.config?.action || 'run-all'
                      if (action === 'run-targets') {
                        void runTargetSqlCells(metadata.config?.targetCellIds || [])
                        return
                      }
                      void controller.runAllSqlCells()
                    }}
                  />
                ) : (
                  <div className={styles.widgetCollapsedShell}>
                    <WidgetCellEditor
                      metadata={widgetDraftByCell[cell.id] || (cell.metadata_json as any)}
                      collapsed
                      disabled={runningAll}
                      notebookId={activeNotebookId}
                      inputValues={inputValues}
                      availableSqlTargets={availableSqlTargets}
                      onChange={(next) => onWidgetMetadataChange(cell, next)}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                {!cell.collapsed ? (
                  <div className={styles.markdownActions}>
                    <button
                      className="btn small"
                      onClick={() =>
                        setPreviewMarkdown((prev) => ({
                          ...prev,
                          [cell.id]: !(prev[cell.id] ?? false),
                        }))
                      }
                    >
                      {previewMarkdown[cell.id] ? 'Edit' : 'Preview'}
                    </button>
                  </div>
                ) : null}
                {cell.collapsed || previewMarkdown[cell.id] ? (
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
                    onChange={(event) => onChangeCell(cell, event.target.value)}
                  />
                )}
              </>
            )}
          </section>
        )
      })}
    </>
  )
}

function CellResult({ result }: { result: QueryResult }) {
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
}

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

function MarkdownPreview({ source }: { source: string }) {
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
}
