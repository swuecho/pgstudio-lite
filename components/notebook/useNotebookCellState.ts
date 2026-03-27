import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryResult } from '../sql-editor/types'
import type {
  NotebookCell,
  NotebookCellType,
  NotebookDetail,
  NotebookWidgetMetadata,
} from './types'
import { buildInputValues } from '../../lib/notebook-reactive'
import { createCell, deleteCell, updateCell } from '../../features/notebook/notebook.service'
import { extractTemplateKeys } from '../../lib/notebook-params'
import {
  createDefaultWidgetMetadata,
  createWidgetMetadataFromPreset,
  normalizeWidgetMetadata,
  type NotebookWidgetPresetId,
} from '../../lib/notebook-widgets'
import { countWidgetValidationMessages, getWidgetValidationMessages, type WidgetValidationMessages } from '../../lib/notebook-widget-validation'
import {
  getPendingSaveCount,
  getStaleResultByCell,
  getCellUiStateByCell,
  syncCellDraftState,
  syncWidgetDraftState,
  syncCellResultState,
  syncExecutedQueryState,
  getWidgetParameterKeys,
  getResetWidgetValue,
  pushValidationMessage,
  getNormalizedWidgetMetadata,
} from './cellSyncHelpers'
import { useCellAutoSave } from './useCellAutoSave'
import { useCellExecution } from './useCellExecution'
import { useReactiveRunner } from './useReactiveRunner'
import { useWidgetOptions } from './useWidgetOptions'

export function useNotebookCellState(params: {
  activeNotebookId: string
  detailQueryData: NotebookDetail | undefined
  setStatus: (value: string) => void
}) {
  const { activeNotebookId, detailQueryData, setStatus } = params
  const queryClient = useQueryClient()
  const [selectedCellId, setSelectedCellId] = useState<string>('')
  const [selectedInsertParamByCell, setSelectedInsertParamByCell] = useState<Record<string, string>>({})
  const [previewMarkdown, setPreviewMarkdown] = useState<Record<string, boolean>>({})
  const [draftByCell, setDraftByCell] = useState<Record<string, string>>({})
  const [widgetDraftByCell, setWidgetDraftByCell] = useState<Record<string, NotebookWidgetMetadata>>({})

  const cellSectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const draftByCellRef = useRef<Record<string, string>>({})
  const widgetDraftByCellRef = useRef<Record<string, NotebookWidgetMetadata>>({})
  const lastSyncedResultByCellRef = useRef<Record<string, QueryResult | null>>({})
  const lastSyncedExecutedQueryByCellRef = useRef<Record<string, string>>({})

  const cells = detailQueryData?.cells || []
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

  const inputValues = useMemo(() => buildInputValues(sortedCells, widgetDraftByCell), [sortedCells, widgetDraftByCell])

  const widgetOptions = useWidgetOptions({
    activeNotebookId,
    sortedCells,
    widgetDraftByCell,
    inputValues,
  })

  // --- Ref sync effects ---

  useEffect(() => { draftByCellRef.current = draftByCell }, [draftByCell])
  useEffect(() => { widgetDraftByCellRef.current = widgetDraftByCell }, [widgetDraftByCell])
  useEffect(() => { execution.sortedCellsRef.current = sortedCells }, [sortedCells])
  useEffect(() => { execution.activeNotebookIdRef.current = activeNotebookId }, [activeNotebookId])
  useEffect(() => { execution.draftByCellRef.current = draftByCell }, [draftByCell])
  useEffect(() => { execution.widgetDraftByCellRef.current = widgetDraftByCell }, [widgetDraftByCell])

  useEffect(() => { setSelectedCellId('') }, [activeNotebookId])
  useEffect(() => {
    autoSave.setPendingSaveByCell({})
    autoSave.setSaveErrorByCell({})
    execution.setQueuedRunByCell({})
  }, [activeNotebookId])

  // --- Draft sync effects ---

  useEffect(() => {
    setDraftByCell((prev) => {
      const synced = syncCellDraftState({
        cells,
        previousDrafts: prev,
        previousServerContent: autoSave.lastSyncedContentByCellRef.current,
        pendingSavePayloads: autoSave.pendingSavePayloadRef.current,
      })
      autoSave.lastSyncedContentByCellRef.current = synced.serverContentByCell
      return synced.drafts
    })
  }, [cells])

  useEffect(() => {
    setWidgetDraftByCell((prev) => {
      const synced = syncWidgetDraftState({
        cells,
        previousDrafts: prev,
        previousServerMetadata: autoSave.lastSyncedWidgetByCellRef.current,
        pendingSavePayloads: autoSave.pendingSavePayloadRef.current,
      })
      autoSave.lastSyncedWidgetByCellRef.current = synced.serverMetadataByCell
      return synced.drafts
    })
  }, [cells])

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
  }, [cells])

  useEffect(() => {
    return () => {
      reactive.cleanupReactiveTimers()
    }
  }, [])

  useEffect(() => {
    if (!selectedCellId) return
    if (sortedCells.some((cell) => cell.id === selectedCellId)) return
    setSelectedCellId('')
  }, [sortedCells, selectedCellId])

  // --- Derived state ---

  const inputKeys = useMemo(() => new Set(Object.keys(inputValues)), [inputValues])

  const notebookInputs = useMemo(
    () => {
      const params: Array<{ key: string; label: string; inputType: string }> = []

      for (const cell of sortedCells) {
        if (cell.type !== 'widget') continue
        const metadata = widgetDraftByCell[cell.id]
        if (!metadata) continue

        if (
          metadata.widgetType === 'text' ||
          metadata.widgetType === 'number' ||
          metadata.widgetType === 'date' ||
          metadata.widgetType === 'datetime-local' ||
          metadata.widgetType === 'checkbox' ||
          metadata.widgetType === 'select' ||
          metadata.widgetType === 'range' ||
          metadata.widgetType === 'multiselect'
        ) {
          if (!metadata.key) continue
          params.push({
            key: metadata.key,
            label: metadata.label || metadata.key,
            inputType: metadata.widgetType,
          })
          continue
        }

        if (metadata.widgetType === 'radio-group' && metadata.key) {
          params.push({
            key: metadata.key,
            label: metadata.label || metadata.key,
            inputType: 'widget-radio',
          })
          continue
        }

        if (metadata.widgetType === 'date-range') {
          const startKey = metadata.config?.startKey?.trim()
          const endKey = metadata.config?.endKey?.trim()
          if (startKey) {
            params.push({
              key: startKey,
              label: `${metadata.label || 'Date Range'} Start`,
              inputType: 'widget-date',
            })
          }
          if (endKey) {
            params.push({
              key: endKey,
              label: `${metadata.label || 'Date Range'} End`,
              inputType: 'widget-date',
            })
          }
        }
      }

      return params
    },
    [sortedCells, widgetDraftByCell]
  )

  const inputCellIdByKey = useMemo(() => {
    const out: Record<string, string> = {}
    for (const cell of sortedCells) {
      if (cell.type !== 'widget') continue
      const metadata = widgetDraftByCell[cell.id]
      if (!metadata) continue
      if (metadata.key) out[metadata.key] = cell.id
      if (metadata.widgetType === 'date-range') {
        const startKey = metadata.config?.startKey?.trim()
        const endKey = metadata.config?.endKey?.trim()
        if (startKey) out[startKey] = cell.id
        if (endKey) out[endKey] = cell.id
      }
    }
    return out
  }, [sortedCells, widgetDraftByCell])

  const validationMessagesByCell = useMemo(() => {
    const out: Record<string, WidgetValidationMessages> = {}
    const duplicateKeys = new Map<string, string[]>()

    for (const cell of sortedCells) {
      if (cell.type !== 'widget') continue
      const metadata = widgetDraftByCell[cell.id]
      if (!metadata) continue
      for (const key of getWidgetParameterKeys(metadata)) {
        const next = duplicateKeys.get(key) || []
        next.push(cell.id)
        duplicateKeys.set(key, next)
      }
    }

    for (const cell of sortedCells) {
      if (cell.type !== 'widget') continue
      const metadata = widgetDraftByCell[cell.id]
      if (!metadata) continue

      const extraMessages: WidgetValidationMessages = {}
      for (const key of getWidgetParameterKeys(metadata)) {
        const owners = duplicateKeys.get(key) || []
        if (owners.length < 2) continue
        if (metadata.widgetType === 'date-range') {
          if (metadata.config?.startKey === key) pushValidationMessage(extraMessages, 'startKey', `Parameter key '${key}' is already used by another widget`)
          if (metadata.config?.endKey === key) pushValidationMessage(extraMessages, 'endKey', `Parameter key '${key}' is already used by another widget`)
        } else {
          pushValidationMessage(extraMessages, 'key', `Parameter key '${key}' is already used by another widget`)
        }
      }

      out[cell.id] = getWidgetValidationMessages(metadata, extraMessages)
    }

    return out
  }, [sortedCells, widgetDraftByCell])

  const parameterWidgets = useMemo(() => {
    return sortedCells.flatMap((cell) => {
      if (cell.type !== 'widget') return []
      const metadata = widgetDraftByCell[cell.id]
      if (!metadata) return []
      const paramKeys = getWidgetParameterKeys(metadata)
      if (!paramKeys.length) return []

      const usedByCellIds = sortedCells
        .filter((item) => item.type === 'sql')
        .filter((item) => {
          const query = draftByCell[item.id] ?? item.content
          const templateKeys = extractTemplateKeys(query)
          return paramKeys.some((key) => templateKeys.includes(key))
        })
        .map((item) => item.id)

      return [{
        cell,
        metadata,
        parameterKeys: paramKeys,
        primaryKey: paramKeys[0],
        source: metadata.config?.optionSource === 'sql' ? 'sql' : 'manual',
        validationMessages: validationMessagesByCell[cell.id] || {},
        validationCount: countWidgetValidationMessages(validationMessagesByCell[cell.id] || {}),
        usedByCellIds,
      }]
    })
  }, [draftByCell, sortedCells, validationMessagesByCell, widgetDraftByCell])

  // --- Mutations ---

  const addCellMutation = useMutation({
    mutationFn: (type: NotebookCellType) => {
      const selectedIndex = sortedCells.findIndex((cell) => cell.id === selectedCellId)
      const position = selectedIndex === -1 ? undefined : selectedIndex + 1
      if (type === 'sql') return createCell(activeNotebookId, { type, content: 'select now();', position })
      if (type === 'markdown') return createCell(activeNotebookId, { type, content: '## Notes\n', position })
      return createCell(activeNotebookId, {
        type: 'widget',
        metadata: createDefaultWidgetMetadata('text') as NotebookWidgetMetadata,
        position,
      })
    },
    onSuccess: (data) => {
      setStatus('Cell added')
      setSelectedCellId(data.item.id)
      if (activeNotebookId) void queryClient.invalidateQueries({ queryKey: ['notebook', activeNotebookId] })
    },
    onError: (error) => setStatus(error instanceof Error ? error.message : String(error)),
  })

  const addWidgetPresetMutation = useMutation({
    mutationFn: (presetId: NotebookWidgetPresetId) => {
      const selectedIndex = sortedCells.findIndex((cell) => cell.id === selectedCellId)
      const position = selectedIndex === -1 ? undefined : selectedIndex + 1
      return createCell(activeNotebookId, {
        type: 'widget',
        metadata: createWidgetMetadataFromPreset(presetId) as NotebookWidgetMetadata,
        position,
      })
    },
    onSuccess: (data) => {
      setStatus('Widget preset added')
      setSelectedCellId(data.item.id)
      if (activeNotebookId) void queryClient.invalidateQueries({ queryKey: ['notebook', activeNotebookId] })
    },
    onError: (error) => setStatus(error instanceof Error ? error.message : String(error)),
  })

  const duplicateWidgetMutation = useMutation({
    mutationFn: (cellId: string) => {
      const sourceCell = sortedCells.find((cell) => cell.id === cellId)
      if (!sourceCell || sourceCell.type !== 'widget') {
        throw new Error('widget cell not found')
      }
      const position = sourceCell.position + 1
      const metadata = widgetDraftByCellRef.current[cellId] || getNormalizedWidgetMetadata(sourceCell)
      return createCell(activeNotebookId, {
        type: 'widget',
        metadata,
        position,
      })
    },
    onSuccess: (data) => {
      setStatus('Widget duplicated')
      setSelectedCellId(data.item.id)
      if (activeNotebookId) void queryClient.invalidateQueries({ queryKey: ['notebook', activeNotebookId] })
    },
    onError: (error) => setStatus(error instanceof Error ? error.message : String(error)),
  })

  const deleteCellMutation = useMutation({
    mutationFn: (cellId: string) => deleteCell(activeNotebookId, cellId),
    onSuccess: () => {
      setStatus('Cell deleted')
      if (activeNotebookId) void queryClient.invalidateQueries({ queryKey: ['notebook', activeNotebookId] })
    },
    onError: (error) => setStatus(error instanceof Error ? error.message : String(error)),
  })

  // --- Action handlers ---

  function onChangeCell(cell: NotebookCell, next: string) {
    setDraftByCell((prev) => ({ ...prev, [cell.id]: next }))
    autoSave.scheduleCellSave(cell, { content: next })
  }

  function onWidgetMetadataChange(cell: NotebookCell, next: NotebookWidgetMetadata) {
    const previous =
      widgetDraftByCellRef.current[cell.id] ||
      (cell.metadata_json && typeof cell.metadata_json === 'object' && 'widgetType' in cell.metadata_json
        ? normalizeWidgetMetadata(cell.metadata_json as NotebookWidgetMetadata)
        : createDefaultWidgetMetadata('callout'))
    const normalized = normalizeWidgetMetadata(next) as NotebookWidgetMetadata
    const nextDrafts = { ...widgetDraftByCellRef.current, [cell.id]: normalized }
    widgetDraftByCellRef.current = nextDrafts
    setWidgetDraftByCell(nextDrafts)
    autoSave.scheduleCellSave(cell, { metadata: normalized })

    reactive.scheduleWidgetReactiveRuns(cell.id, previous as NotebookWidgetMetadata, normalized)
  }

  function updateParameterWidget(cellId: string, next: NotebookWidgetMetadata) {
    const cell = execution.sortedCellsRef.current.find((item) => item.id === cellId)
    if (!cell || cell.type !== 'widget') return
    onWidgetMetadataChange(cell, next)
  }

  function resetParameterWidget(cellId: string) {
    const cell = execution.sortedCellsRef.current.find((item) => item.id === cellId)
    if (!cell || cell.type !== 'widget') return
    const metadata = widgetDraftByCellRef.current[cell.id]
    if (!metadata) return
    const resetValue = getResetWidgetValue(metadata)
    if (resetValue === undefined) return
    onWidgetMetadataChange(cell, { ...metadata, value: resetValue })
  }

  function moveCell(cell: NotebookCell, direction: 'up' | 'down') {
    const to = direction === 'up' ? cell.position - 1 : cell.position + 1
    if (to < 0 || to >= sortedCells.length) return
    void updateCell(activeNotebookId, { cellId: cell.id, position: to })
      .then(() => {
        setStatus('Cell reordered')
        void queryClient.invalidateQueries({ queryKey: ['notebook', activeNotebookId] })
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : String(error)))
  }

  function toggleCellCollapsed(cell: NotebookCell) {
    void updateCell(activeNotebookId, { cellId: cell.id, collapsed: !cell.collapsed })
      .then(() => {
        setStatus(cell.collapsed ? 'Cell expanded' : 'Cell collapsed')
        void queryClient.invalidateQueries({ queryKey: ['notebook', activeNotebookId] })
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : String(error)))
  }

  function jumpToInputCell(paramKey: string) {
    const cellId = inputCellIdByKey[paramKey]
    if (!cellId) {
      setStatus(`Input '${paramKey}' not found`)
      return
    }
    const section = cellSectionRefs.current[cellId]
    if (!section) return
    section.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const control = section.querySelector('input, select, textarea') as HTMLElement | null
    control?.focus()
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
    onChangeCell(cell, next)
    setStatus(`Inserted ${token}`)
  }

  function deleteCellById(cellId: string) {
    deleteCellMutation.mutate(cellId)
  }

  function duplicateWidgetCellById(cellId: string) {
    duplicateWidgetMutation.mutate(cellId)
  }

  async function flushPendingSaves(reason?: string) {
    return autoSave.flushPendingSaves(activeNotebookId, reason)
  }

  // --- Final derived state ---

  const pendingSaveCount = useMemo(() => getPendingSaveCount(autoSave.pendingSaveByCell), [autoSave.pendingSaveByCell])
  const staleResultByCell = useMemo(
    () => getStaleResultByCell({
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
    [sortedCells, autoSave.pendingSaveByCell, autoSave.saveErrorByCell, execution.queuedRunByCell, execution.runningCellId, staleResultByCell]
  )

  return {
    addCellMutation,
    duplicateWidgetCellById,
    duplicateWidgetMutation,
    addWidgetPresetMutation,
    cellSectionRefs,
    deleteCellById,
    draftByCell,
    inputValues,
    inputKeys,
    jumpToInputCell,
    moveCell,
    notebookInputs,
    parameterWidgets,
    onChangeCell,
    cellUiStateByCell,
    pendingSaveByCell: autoSave.pendingSaveByCell,
    pendingSaveCount,
    previewMarkdown,
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
    runSqlCellWithShortcuts: execution.runSqlCellWithShortcuts,
    selectedCellId,
    selectedInsertParamByCell,
    setPreviewMarkdown,
    setSelectedCellId,
    setSelectedInsertParamByCell,
    sortedCells,
    sqlEditorRefs: execution.sqlEditorRefs,
    toggleCellCollapsed,
    updateParameterWidget,
    resetParameterWidget,
    validationMessagesByCell,
    flushPendingSaves,
    insertParamIntoSqlCell,
    widgetDraftByCell,
    onWidgetMetadataChange,
  }
}

// Re-export pure functions for backward compatibility with tests
export {
  getChangedWidgetParamKeys,
  syncCellDraftState,
  syncWidgetDraftState,
  syncCellResultState,
  syncExecutedQueryState,
  clearPendingSaveCell,
  clearSaveError,
  getPendingSaveCount,
  getPendingSaveEntries,
  getStaleResultByCell,
  markQueuedCells,
  clearQueuedCells,
  getCellUiStateByCell,
} from './cellSyncHelpers'
