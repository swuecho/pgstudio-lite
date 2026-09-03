import { useEffect, useMemo, useRef, useState } from 'react'
import type { QueryResult } from '../sql-editor/types'
import type { NotebookCell, NotebookDetail } from './types'
import { buildInputValues } from '@/lib/notebook-reactive'
import {
  getPendingSaveCount,
  getStaleResultByCell,
  getCellUiStateByCell,
  syncCellResultState,
  syncExecutedQueryState,
} from './cellSyncHelpers'
import {
  getInputCellIdByKey,
  getNotebookInputs,
  getParameterWidgets,
  getValidationMessagesByCell,
} from './notebookInputModel'
import { useCellAutoSave } from './useCellAutoSave'
import { useCellDrafts } from './useCellDrafts'
import { useCellExecution } from './useCellExecution'
import { useCellMutations } from './useCellMutations'
import { useReactiveRunner } from './useReactiveRunner'
import { useWidgetOptions } from './useWidgetOptions'

/**
 * Composes the per-cell hooks (drafts, auto-save, execution, reactive runs,
 * widget options, mutations) into the single controller the notebook page
 * consumes, and owns what is left: selection, pending focus actions, and the
 * derived parameter model.
 */
export function useNotebookCellState(params: {
  activeNotebookId: string
  detailQueryData: NotebookDetail | undefined
  setStatus: (value: string) => void
}) {
  const { activeNotebookId, detailQueryData, setStatus } = params
  const [selectedCellId, setSelectedCellId] = useState<string>('')
  const [selectedInsertParamByCell, setSelectedInsertParamByCell] = useState<Record<string, string>>({})
  const [previewMarkdown, setPreviewMarkdown] = useState<Record<string, boolean>>({})
  const [pendingCellAction, setPendingCellAction] = useState<{
    cellId: string
    target: 'control' | 'editor'
  } | null>(null)

  const cellSectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const lastSyncedResultByCellRef = useRef<Record<string, QueryResult | null>>({})
  const lastSyncedExecutedQueryByCellRef = useRef<Record<string, string>>({})

  const cells = useMemo(() => detailQueryData?.cells || [], [detailQueryData?.cells])
  const sortedCells = useMemo(() => [...cells].sort((a, b) => a.position - b.position), [cells])

  // --- Sub-hooks (all called unconditionally before any effects) ---

  const autoSave = useCellAutoSave({ activeNotebookId, setStatus })

  const execution = useCellExecution({
    activeNotebookId,
    setStatus,
    flushPendingSaves: autoSave.flushPendingSaves,
  })

  const reactive = useReactiveRunner({
    setStatus,
    reactiveRunGenerationRef: execution.reactiveRunGenerationRef,
    activeNotebookIdRef: execution.activeNotebookIdRef,
    runningAllRef: execution.runningAllRef,
    runningCellIdRef: execution.runningCellIdRef,
    sortedCellsRef: execution.sortedCellsRef,
    draftByCellRef: execution.draftByCellRef,
    widgetDraftByCellRef: execution.widgetDraftByCellRef,
    setQueuedRunByCell: execution.setQueuedRunByCell,
    enqueueExecution: execution.enqueueExecution,
    executeQueuedSqlRun: execution.executeQueuedSqlRun,
  })

  const drafts = useCellDrafts({
    cells,
    sortedCellsRef: execution.sortedCellsRef,
    autoSave,
    scheduleWidgetReactiveRuns: reactive.scheduleWidgetReactiveRuns,
  })
  const { draftByCell, widgetDraftByCell } = drafts

  const inputValues = useMemo(
    () => buildInputValues(sortedCells, widgetDraftByCell),
    [sortedCells, widgetDraftByCell]
  )

  const widgetOptions = useWidgetOptions({
    activeNotebookId,
    activeConnectionName: detailQueryData?.notebook.connection_name || '',
    sortedCells,
    widgetDraftByCell,
    inputValues,
  })

  const mutations = useCellMutations({
    activeNotebookId,
    setStatus,
    sortedCells,
    selectedCellId,
    setSelectedCellId,
    widgetDraftByCellRef: drafts.widgetDraftByCellRef,
  })

  // --- Keep the execution refs current (refs are stable, so they stay out of deps) ---

  useEffect(() => {
    execution.sortedCellsRef.current = sortedCells
  }, [sortedCells]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    execution.activeNotebookIdRef.current = activeNotebookId
  }, [activeNotebookId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    execution.draftByCellRef.current = draftByCell
  }, [draftByCell]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    execution.widgetDraftByCellRef.current = widgetDraftByCell
  }, [widgetDraftByCell]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Reset transient per-notebook state when switching notebooks ---

  useEffect(() => {
    setSelectedCellId('')
    setPendingCellAction(null)
    autoSave.setPendingSaveByCell({})
    autoSave.setSaveErrorByCell({})
    execution.setQueuedRunByCell({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNotebookId])

  // --- Reconcile execution results with the server copy ---

  useEffect(() => {
    execution.setResultsByCell((prev) => {
      const synced = syncCellResultState({
        cells,
        previousResults: prev,
        previousServerResults: lastSyncedResultByCellRef.current,
      })
      lastSyncedResultByCellRef.current = synced.serverResultsByCell
      return synced.results
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells])

  useEffect(() => {
    execution.setLastExecutedQueryByCell((prev) => {
      const synced = syncExecutedQueryState({
        cells,
        previousExecutedQueryByCell: prev,
        previousServerExecutedQueryByCell: lastSyncedExecutedQueryByCellRef.current,
      })
      lastSyncedExecutedQueryByCellRef.current = synced.serverExecutedQueryByCell
      return synced.executedQueryByCell
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells])

  useEffect(() => {
    return () => {
      reactive.cleanupReactiveTimers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Drop selection / pending focus that points at a cell that no longer exists ---

  useEffect(() => {
    if (!selectedCellId) return
    if (sortedCells.some((cell) => cell.id === selectedCellId)) return
    setSelectedCellId('')
  }, [sortedCells, selectedCellId])

  useEffect(() => {
    if (!pendingCellAction) return
    if (sortedCells.some((cell) => cell.id === pendingCellAction.cellId)) return
    setPendingCellAction(null)
  }, [pendingCellAction, sortedCells])

  // --- Derived parameter model ---

  const inputKeys = useMemo(() => new Set(Object.keys(inputValues)), [inputValues])
  const notebookInputs = useMemo(
    () => getNotebookInputs(sortedCells, widgetDraftByCell),
    [sortedCells, widgetDraftByCell]
  )
  const inputCellIdByKey = useMemo(
    () => getInputCellIdByKey(sortedCells, widgetDraftByCell),
    [sortedCells, widgetDraftByCell]
  )
  const validationMessagesByCell = useMemo(
    () => getValidationMessagesByCell(sortedCells, widgetDraftByCell),
    [sortedCells, widgetDraftByCell]
  )
  const parameterWidgets = useMemo(
    () => getParameterWidgets({ sortedCells, widgetDraftByCell, draftByCell, validationMessagesByCell }),
    [draftByCell, sortedCells, validationMessagesByCell, widgetDraftByCell]
  )

  // --- Selection and focus handlers ---

  function jumpToInputCell(paramKey: string) {
    const cellId = inputCellIdByKey[paramKey]
    if (!cellId) {
      setStatus(`Input '${paramKey}' not found`)
      return
    }
    setSelectedCellId(cellId)
    setPendingCellAction({ cellId, target: 'control' })
    setStatus(`Focused input '${paramKey}'`)
  }

  function insertParamIntoSqlCell(cell: NotebookCell, paramKey: string) {
    if (!paramKey) return
    const token = `{{${paramKey}}}`
    const editor = execution.sqlEditorRefs.current[cell.id]
    if (editor) {
      const selection = editor.getSelection()
      if (selection) {
        editor.executeEdits('insert-param', [{ range: selection, text: token, forceMoveMarkers: true }])
        editor.focus()
        setStatus(`Inserted ${token}`)
        return
      }
    }

    const draft = draftByCell[cell.id] ?? cell.content
    const next = draft.length === 0 ? token : `${draft}${/\s$/.test(draft) ? '' : ' '}${token}`
    drafts.onChangeCell(cell, next)
    setStatus(`Inserted ${token}`)
  }

  function clearPendingCellAction(cellId?: string) {
    setPendingCellAction((current) => {
      if (!current) return current
      if (cellId && current.cellId !== cellId) return current
      return null
    })
  }

  async function runSqlCellWithShortcuts(cell: NotebookCell, runAndFocusNext = false) {
    const executedCount = await execution.runSqlCellWithShortcuts(cell)
    if (!runAndFocusNext || !executedCount) return executedCount

    const currentIndex = sortedCells.findIndex((item) => item.id === cell.id)
    if (currentIndex === -1) return executedCount

    for (let i = currentIndex + 1; i < sortedCells.length; i += 1) {
      const nextCell = sortedCells[i]
      if (nextCell.type !== 'sql' || nextCell.collapsed) continue
      setSelectedCellId(nextCell.id)
      setPendingCellAction({ cellId: nextCell.id, target: 'editor' })
      break
    }

    return executedCount
  }

  async function flushPendingSaves(reason?: string) {
    return autoSave.flushPendingSaves(activeNotebookId, reason)
  }

  // --- Final derived state ---

  const pendingSaveCount = useMemo(
    () => getPendingSaveCount(autoSave.pendingSaveByCell),
    [autoSave.pendingSaveByCell]
  )
  const staleResultByCell = useMemo(
    () =>
      getStaleResultByCell({
        sortedCells,
        draftByCell,
        resultsByCell: execution.resultsByCell,
        lastExecutedQueryByCell: execution.lastExecutedQueryByCell,
      }),
    [sortedCells, draftByCell, execution.resultsByCell, execution.lastExecutedQueryByCell]
  )
  const cellUiStateByCell = useMemo(
    () =>
      getCellUiStateByCell({
        sortedCells,
        pendingSaveByCell: autoSave.pendingSaveByCell,
        saveErrorByCell: autoSave.saveErrorByCell,
        queuedRunByCell: execution.queuedRunByCell,
        runningCellId: execution.runningCellId,
        staleResultByCell,
      }),
    [
      sortedCells,
      autoSave.pendingSaveByCell,
      autoSave.saveErrorByCell,
      execution.queuedRunByCell,
      execution.runningCellId,
      staleResultByCell,
    ]
  )

  return {
    addCellMutation: mutations.addCellMutation,
    duplicateWidgetCellById: mutations.duplicateWidgetCellById,
    duplicateWidgetMutation: mutations.duplicateWidgetMutation,
    addWidgetPresetMutation: mutations.addWidgetPresetMutation,
    cellSectionRefs,
    deleteCellById: mutations.deleteCellById,
    draftByCell,
    inputValues,
    inputKeys,
    jumpToInputCell,
    moveCell: mutations.moveCell,
    notebookInputs,
    parameterWidgets,
    onChangeCell: drafts.onChangeCell,
    cellUiStateByCell,
    pendingSaveByCell: autoSave.pendingSaveByCell,
    pendingSaveCount,
    previewMarkdown,
    pendingCellAction,
    refreshSqlOptions: widgetOptions.refreshSqlOptions,
    resultsByCell: execution.resultsByCell,
    resolvedOptionsByCell: widgetOptions.resolvedOptionsByCell,
    queuedRunByCell: execution.queuedRunByCell,
    saveErrorByCell: autoSave.saveErrorByCell,
    staleResultByCell,
    runTargetSqlCells: (cellIds: string[]) => execution.runTargetSqlCells(sortedCells, cellIds),
    runAllSqlCells: () => execution.runAllSqlCells(sortedCells),
    runningAll: execution.runningAll,
    runningCellId: execution.runningCellId,
    runSqlCellWithShortcuts,
    selectedCellId,
    selectedInsertParamByCell,
    setPreviewMarkdown,
    setSelectedCellId,
    setSelectedInsertParamByCell,
    sortedCells,
    sqlEditorRefs: execution.sqlEditorRefs,
    toggleCellCollapsed: mutations.toggleCellCollapsed,
    updateParameterWidget: drafts.updateParameterWidget,
    resetParameterWidget: drafts.resetParameterWidget,
    clearPendingCellAction,
    validationMessagesByCell,
    flushPendingSaves,
    insertParamIntoSqlCell,
    widgetDraftByCell,
    onWidgetMetadataChange: drafts.onWidgetMetadataChange,
  }
}
