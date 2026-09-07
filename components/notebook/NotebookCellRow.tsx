import { memo, useCallback, useEffect } from 'react'
import { SqlCellBody } from './SqlCellBody'
import { WidgetCellBody } from './WidgetCellBody'
import { MarkdownCellBody } from './MarkdownCellBody'
import { formatCellUiState, toCompactSqlPreview } from './cellPresentation'
import type { NotebookPageController } from './useNotebookPageState'
import type { NotebookCell } from './types'
import type { NotebookWidgetMetadata } from '@/lib/notebook-widgets'
import { extractTemplateKeys } from '@/lib/notebook-params'
import styles from './NotebookPage.module.css'

type NotebookCellRowProps = {
  cell: NotebookCell
  controller: NotebookPageController
}

/**
 * One cell: the header (type pill, position, run status, collapse and
 * reorder actions) plus the SQL, widget, or markdown body. Memoized because
 * the virtualized list re-renders on every scroll.
 */
export const NotebookCellRow = memo(function NotebookCellRow({ cell, controller }: NotebookCellRowProps) {
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
  const handleRef = useCallback(
    (element: HTMLElement | null) => {
      cellSectionRefs.current[cell.id] = element
    },
    [cell.id, cellSectionRefs]
  )
  const handleChange = useCallback((next: string) => onChangeCell(cell, next), [cell, onChangeCell])
  const handleRun = useCallback(() => {
    void runSqlCellWithShortcuts(cell, false)
  }, [cell, runSqlCellWithShortcuts])
  const handleRunAndFocusNext = useCallback(() => {
    void runSqlCellWithShortcuts(cell, true)
  }, [cell, runSqlCellWithShortcuts])
  const handleMountEditorAndFocus = useCallback(
    (editor: any) => {
      sqlEditorRefs.current[cell.id] = editor
      if (pendingCellAction?.cellId === cell.id && pendingCellAction.target === 'editor') {
        editor.focus()
        clearPendingCellAction(cell.id)
      }
    },
    [cell.id, clearPendingCellAction, pendingCellAction, sqlEditorRefs]
  )
  const handleUnmountEditor = useCallback(() => {
    delete sqlEditorRefs.current[cell.id]
  }, [cell.id, sqlEditorRefs])
  const handleToggleCollapsed = useCallback(() => toggleCellCollapsed(cell), [cell, toggleCellCollapsed])
  const handleDuplicate = useCallback(
    () => duplicateWidgetCellById(cell.id),
    [cell.id, duplicateWidgetCellById]
  )
  const handleMoveUp = useCallback(() => moveCell(cell, 'up'), [cell, moveCell])
  const handleMoveDown = useCallback(() => moveCell(cell, 'down'), [cell, moveCell])
  const handleDelete = useCallback(() => deleteCellById(cell.id), [cell.id, deleteCellById])
  const handleWidgetChange = useCallback(
    (next: NotebookWidgetMetadata) => onWidgetMetadataChange(cell, next as any),
    [cell, onWidgetMetadataChange]
  )
  const handleInsertParam = useCallback(
    () => insertParamIntoSqlCell(cell, selectedInsertParam),
    [cell, insertParamIntoSqlCell, selectedInsertParam]
  )
  const handleRefreshSqlOptions = useCallback(
    () => controller.refreshSqlOptions(cell.id),
    [controller, cell.id]
  )

  const handleTriggerAction = useCallback(
    (metadata: NotebookWidgetMetadata) => {
      const action = metadata.config?.action || 'run-all'
      if (action === 'run-targets') {
        const ids = (metadata.config?.targetCellIds || []) as string[]
        void runTargetSqlCells(ids)
        return
      }
      void controller.runAllSqlCells()
    },
    [controller, runTargetSqlCells]
  )

  const handleSelectInsertParam = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedInsertParamByCell((prev) => ({ ...prev, [cell.id]: event.target.value }))
    },
    [cell.id, setSelectedInsertParamByCell]
  )

  const handleToggleMarkdownPreview = useCallback(() => {
    setPreviewMarkdown((prev) => ({
      ...prev,
      [cell.id]: !(prev[cell.id] ?? false),
    }))
  }, [cell.id, setPreviewMarkdown])

  const handleMarkdownChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChangeCell(cell, event.target.value)
    },
    [cell, onChangeCell]
  )

  // Focus requests from the sidebar / keyboard shortcuts land here once the
  // row is mounted and (for SQL cells) the editor ref is populated.
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
      <div
        className={[styles.cellHead, cell.collapsed ? styles.cellHeadCompact : ''].filter(Boolean).join(' ')}
      >
        <span className="pill">
          {cell.type === 'markdown' ? 'MD' : cell.type === 'widget' ? 'WGT' : 'SQL'}
        </span>
        <span className="history-meta">#{cell.position + 1}</span>
        {cell.last_run_at ? (
          <span className="history-meta">Last run: {new Date(cell.last_run_at).toLocaleString()}</span>
        ) : null}
        <span className="history-meta">{formatCellUiState(cellUiState)}</span>
        <div className={styles.cellActions}>
          <button
            className="btn small icon-btn"
            onClick={handleToggleCollapsed}
            title={cell.collapsed ? 'Edit mode' : 'Preview mode'}
            aria-label={cell.collapsed ? 'Edit mode' : 'Preview mode'}
          >
            {cell.collapsed ? <PencilIcon /> : <EyeIcon />}
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

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4l10-10-4-4L4 16v4Zm13.7-11.3 1.6-1.6a1 1 0 0 0 0-1.4l-1.3-1.3a1 1 0 0 0-1.4 0L15 6l2.7 2.7Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function EyeIcon() {
  return (
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
  )
}
