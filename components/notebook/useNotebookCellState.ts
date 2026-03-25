import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { editor as MonacoEditorNs } from 'monaco-editor'
import type { QueryResult } from '../sql-editor/types'
import type {
  NotebookCell,
  NotebookCellType,
  NotebookDetail,
  NotebookWidgetMetadata,
} from './types'
import {
  buildInputValues,
  getDependentSqlTargets,
  getDependentSqlTargetsForInputKeys,
  type ReactiveNotebookState,
} from '../../lib/notebook-reactive'
import { createCell, deleteCell, runCell, updateCell } from '../../features/notebook/notebook.service'
import { extractTemplateKeys } from '../../lib/notebook-params'
import { createDefaultWidgetMetadata, getWidgetParamValues, normalizeWidgetMetadata } from '../../lib/notebook-widgets'

export function useNotebookCellState(params: {
  activeNotebookId: string
  detailQueryData: NotebookDetail | undefined
  setStatus: (value: string) => void
}) {
  const { activeNotebookId, detailQueryData, setStatus } = params
  const queryClient = useQueryClient()
  const [runningCellId, setRunningCellId] = useState<string>('')
  const [runningAll, setRunningAll] = useState(false)
  const [resultsByCell, setResultsByCell] = useState<Record<string, QueryResult>>({})
  const [lastExecutedQueryByCell, setLastExecutedQueryByCell] = useState<Record<string, string>>({})
  const [draftByCell, setDraftByCell] = useState<Record<string, string>>({})
  const [widgetDraftByCell, setWidgetDraftByCell] = useState<Record<string, NotebookWidgetMetadata>>({})
  const [selectedCellId, setSelectedCellId] = useState<string>('')
  const [selectedInsertParamByCell, setSelectedInsertParamByCell] = useState<Record<string, string>>({})
  const [previewMarkdown, setPreviewMarkdown] = useState<Record<string, boolean>>({})
  const [pendingSaveByCell, setPendingSaveByCell] = useState<Record<string, boolean>>({})
  const [saveErrorByCell, setSaveErrorByCell] = useState<Record<string, string>>({})
  const [queuedRunByCell, setQueuedRunByCell] = useState<Record<string, boolean>>({})

  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingSavePayloadRef = useRef<Record<string, { content?: string; metadata?: NotebookWidgetMetadata | null }>>({})
  const reactiveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const reactiveRunGenerationRef = useRef(0)
  const executionQueueRef = useRef<Promise<void>>(Promise.resolve())
  const sqlEditorRefs = useRef<Record<string, MonacoEditorNs.IStandaloneCodeEditor>>({})
  const cellSectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const draftByCellRef = useRef<Record<string, string>>({})
  const widgetDraftByCellRef = useRef<Record<string, NotebookWidgetMetadata>>({})
  const lastSyncedContentByCellRef = useRef<Record<string, string>>({})
  const lastSyncedWidgetByCellRef = useRef<Record<string, NotebookWidgetMetadata>>({})
  const lastSyncedResultByCellRef = useRef<Record<string, QueryResult | null>>({})
  const lastSyncedExecutedQueryByCellRef = useRef<Record<string, string>>({})
  const sortedCellsRef = useRef<NotebookCell[]>([])
  const activeNotebookIdRef = useRef('')
  const runningCellIdRef = useRef('')
  const runningAllRef = useRef(false)

  const cells = detailQueryData?.cells || []
  const sortedCells = useMemo(() => [...cells].sort((a, b) => a.position - b.position), [cells])

  useEffect(() => {
    draftByCellRef.current = draftByCell
  }, [draftByCell])

  useEffect(() => {
    widgetDraftByCellRef.current = widgetDraftByCell
  }, [widgetDraftByCell])

  useEffect(() => {
    lastSyncedExecutedQueryByCellRef.current = lastExecutedQueryByCell
  }, [lastExecutedQueryByCell])

  useEffect(() => {
    sortedCellsRef.current = sortedCells
  }, [sortedCells])

  useEffect(() => {
    activeNotebookIdRef.current = activeNotebookId
  }, [activeNotebookId])

  useEffect(() => {
    setSelectedCellId('')
  }, [activeNotebookId])

  useEffect(() => {
    setPendingSaveByCell({})
    setSaveErrorByCell({})
    setQueuedRunByCell({})
  }, [activeNotebookId])

  useEffect(() => {
    runningCellIdRef.current = runningCellId
  }, [runningCellId])

  useEffect(() => {
    runningAllRef.current = runningAll
  }, [runningAll])

  useEffect(() => {
    setDraftByCell((prev) => {
      const synced = syncCellDraftState({
        cells,
        previousDrafts: prev,
        previousServerContent: lastSyncedContentByCellRef.current,
        pendingSavePayloads: pendingSavePayloadRef.current,
      })
      lastSyncedContentByCellRef.current = synced.serverContentByCell
      return synced.drafts
    })
  }, [cells])

  useEffect(() => {
    setWidgetDraftByCell((prev) => {
      const synced = syncWidgetDraftState({
        cells,
        previousDrafts: prev,
        previousServerMetadata: lastSyncedWidgetByCellRef.current,
        pendingSavePayloads: pendingSavePayloadRef.current,
      })
      lastSyncedWidgetByCellRef.current = synced.serverMetadataByCell
      return synced.drafts
    })
  }, [cells])

  useEffect(() => {
    setResultsByCell((prev) => {
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
    setLastExecutedQueryByCell((prev) => {
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
    if (!selectedCellId) return
    if (sortedCells.some((cell) => cell.id === selectedCellId)) return
    setSelectedCellId('')
  }, [sortedCells, selectedCellId])

  useEffect(() => {
    return () => {
      for (const timer of Object.values(saveTimersRef.current)) clearTimeout(timer)
      for (const timer of Object.values(reactiveTimersRef.current)) clearTimeout(timer)
    }
  }, [])

  const inputValues = useMemo(() => buildInputValues(sortedCells, widgetDraftByCell), [sortedCells, widgetDraftByCell])
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

  const deleteCellMutation = useMutation({
    mutationFn: (cellId: string) => deleteCell(activeNotebookId, cellId),
    onSuccess: () => {
      setStatus('Cell deleted')
      if (activeNotebookId) void queryClient.invalidateQueries({ queryKey: ['notebook', activeNotebookId] })
    },
    onError: (error) => setStatus(error instanceof Error ? error.message : String(error)),
  })

  function focusNextSqlEditor(cellId: string) {
    const fromIndex = sortedCells.findIndex((cell) => cell.id === cellId)
    if (fromIndex === -1) return
    for (let i = fromIndex + 1; i < sortedCells.length; i += 1) {
      const next = sortedCells[i]
      if (next.type !== 'sql' || next.collapsed) continue
      const nextEditor = sqlEditorRefs.current[next.id]
      if (nextEditor) {
        nextEditor.focus()
        return
      }
    }
  }

  function scheduleCellSave(cell: NotebookCell, patch: { content?: string; metadata?: NotebookWidgetMetadata | null }) {
    if (!activeNotebookId) return
    const scheduledNotebookId = activeNotebookId
    const existing = saveTimersRef.current[cell.id]
    if (existing) clearTimeout(existing)
    pendingSavePayloadRef.current[cell.id] = {
      ...pendingSavePayloadRef.current[cell.id],
      ...patch,
    }
    setPendingSaveByCell((prev) => ({ ...prev, [cell.id]: true }))
    setSaveErrorByCell((prev) => clearSaveError(prev, cell.id))

    saveTimersRef.current[cell.id] = setTimeout(() => {
      const payload = pendingSavePayloadRef.current[cell.id]
      delete pendingSavePayloadRef.current[cell.id]
      delete saveTimersRef.current[cell.id]
      if (!payload) return
      void updateCell(scheduledNotebookId, { cellId: cell.id, ...payload })
        .then(() => {
          setPendingSaveByCell((prev) => clearPendingSaveCell(prev, cell.id))
          setSaveErrorByCell((prev) => clearSaveError(prev, cell.id))
          if (activeNotebookIdRef.current === scheduledNotebookId) {
            setStatus('Autosaved')
          }
          void queryClient.invalidateQueries({ queryKey: ['notebook', scheduledNotebookId] })
        })
        .catch((error) => {
          setPendingSaveByCell((prev) => clearPendingSaveCell(prev, cell.id))
          setSaveErrorByCell((prev) => ({
            ...prev,
            [cell.id]: error instanceof Error ? error.message : String(error),
          }))
          if (activeNotebookIdRef.current === scheduledNotebookId) {
            setStatus(error instanceof Error ? error.message : String(error))
          }
        })
    }, 700)
  }

  function onChangeCell(cell: NotebookCell, next: string) {
    setDraftByCell((prev) => ({ ...prev, [cell.id]: next }))
    scheduleCellSave(cell, { content: next })
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
    scheduleCellSave(cell, { metadata: normalized })

    scheduleWidgetReactiveRuns(cell.id, previous as NotebookWidgetMetadata, normalized)
  }

  function scheduleWidgetReactiveRuns(cellId: string, previous: NotebookWidgetMetadata, next: NotebookWidgetMetadata) {
    const timer = reactiveTimersRef.current[cellId]
    if (timer) clearTimeout(timer)
    if (next.autoRun === false) return
    const changedKeys = getChangedWidgetParamKeys(previous, next)
    if (!changedKeys.length) return
    reactiveTimersRef.current[cellId] = setTimeout(() => {
      void rerunDependentSqlCells(cellId, changedKeys)
    }, 350)
  }

  function enqueueExecution<T>(label: string, execute: () => Promise<T>) {
    if (runningAllRef.current || Boolean(runningCellIdRef.current)) {
      setStatus(`${label} queued`)
    }
    const queued = executionQueueRef.current.catch(() => undefined).then(execute)
    executionQueueRef.current = queued.then(() => undefined, () => undefined)
    return queued
  }

  async function executeQueuedSqlRun(input: {
    label: string
    cells: NotebookCell[]
    flushReason: string
    mode: 'single' | 'sequence'
    reactiveGeneration?: number
  }) {
    if (input.reactiveGeneration !== undefined && reactiveRunGenerationRef.current !== input.reactiveGeneration) {
      return 0
    }
    setQueuedRunByCell((prev) => clearQueuedCells(prev, input.cells.map((cell) => cell.id)))
    if (!(await flushPendingSaves(input.flushReason))) {
      return 0
    }
    if (input.reactiveGeneration !== undefined && reactiveRunGenerationRef.current !== input.reactiveGeneration) {
      return 0
    }

    const total = input.cells.length
    let successCount = 0

    if (input.mode === 'sequence') {
      setRunningAll(true)
    }

    try {
      for (const cell of input.cells) {
        if (input.reactiveGeneration !== undefined && reactiveRunGenerationRef.current !== input.reactiveGeneration) {
          return successCount
        }

        const notebookId = activeNotebookIdRef.current
        if (!notebookId) return successCount

        const query = (draftByCellRef.current[cell.id] ?? cell.content).trim()
        if (!query) continue

        setRunningCellId(cell.id)
        setStatus(total === 1 ? `Running cell #${cell.position + 1}...` : `Running ${input.label} cell #${cell.position + 1}...`)

        const result = await runCell(
          notebookId,
          cell.id,
          query,
          buildInputValues(sortedCellsRef.current, widgetDraftByCellRef.current)
        )

        if (input.reactiveGeneration !== undefined && reactiveRunGenerationRef.current !== input.reactiveGeneration) {
          return successCount
        }

        setResultsByCell((prev) => ({ ...prev, [cell.id]: result }))
        setLastExecutedQueryByCell((prev) => ({ ...prev, [cell.id]: query }))
        successCount += 1
      }

      setStatus(
        input.mode === 'single'
          ? successCount ? 'Cell executed' : 'No runnable SQL cell'
          : `${input.label} completed (${successCount}/${total})`
      )
      return successCount
    } catch (error) {
      setStatus(`${input.label} stopped: ${error instanceof Error ? error.message : String(error)}`)
      return successCount
    } finally {
      setRunningCellId('')
      if (input.mode === 'sequence') {
        setRunningAll(false)
      }
      if (activeNotebookIdRef.current) {
        void queryClient.invalidateQueries({ queryKey: ['notebook', activeNotebookIdRef.current] })
      }
    }
  }

  async function rerunDependentSqlCells(inputCellId: string, inputKeys: string | string[]) {
    const keys = [...new Set((Array.isArray(inputKeys) ? inputKeys : [inputKeys]).filter(Boolean))]
    if (!keys.length) return
    const generation = reactiveRunGenerationRef.current + 1
    reactiveRunGenerationRef.current = generation

    const getState = (): ReactiveNotebookState => ({
      activeNotebookId: activeNotebookIdRef.current,
      runningAll: runningAllRef.current,
      runningCellId: runningCellIdRef.current,
      sortedCells: sortedCellsRef.current,
      draftByCell: draftByCellRef.current,
      widgetDraftByCell: widgetDraftByCellRef.current,
    })

    const targets = getDependentSqlTargetsForInputKeys(getState(), inputCellId, keys)
    if (!targets.length) return

    const statusLabel = keys.length === 1 ? `'${keys[0]}'` : `${keys.length} widget input(s)`

    try {
      setQueuedRunByCell((prev) => markQueuedCells(prev, targets.map((cell) => cell.id)))
      setStatus(`Input ${statusLabel} changed. Queuing ${targets.length} SQL cell(s)...`)
      await enqueueExecution('Auto-run', () =>
        executeQueuedSqlRun({
          label: 'Auto-run',
          cells: targets,
          flushReason: 'auto-run',
          mode: 'sequence',
          reactiveGeneration: generation,
        })
      )
    } catch (error) {
      setStatus(`Auto-run stopped: ${error instanceof Error ? error.message : String(error)}`)
    }
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
    const editor = sqlEditorRefs.current[cell.id]
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

  async function runSqlCellWithShortcuts(cell: NotebookCell, runAndFocusNext = false) {
    const query = (draftByCell[cell.id] ?? cell.content).trim()
    if (!query) return
    try {
      setQueuedRunByCell((prev) => markQueuedCells(prev, [cell.id]))
      const executedCount = await enqueueExecution('Cell run', () =>
        executeQueuedSqlRun({
          label: 'Cell run',
          cells: [cell],
          flushReason: 'running a cell',
          mode: 'single',
        })
      )
      if (runAndFocusNext && executedCount > 0) focusNextSqlEditor(cell.id)
    } catch {
      // Status and errors are already surfaced by mutation callbacks.
    }
  }

  async function runAllSqlCells() {
    if (!activeNotebookId) return
    const sqlCells = sortedCells.filter((cell) => cell.type === 'sql')
    if (!sqlCells.length) {
      setStatus('No SQL cells to run')
      return
    }
    setQueuedRunByCell((prev) => markQueuedCells(prev, sqlCells.map((cell) => cell.id)))
    await enqueueExecution('Run all', () =>
      executeQueuedSqlRun({
        label: 'Run all',
        cells: sqlCells,
        flushReason: 'running all SQL cells',
        mode: 'sequence',
      })
    )
  }

  async function runTargetSqlCells(cellIds: string[]) {
    if (!activeNotebookId) return
    const targets = sortedCells.filter((cell) => cell.type === 'sql' && cellIds.includes(cell.id))
    if (!targets.length) {
      setStatus('No target SQL cells found')
      return
    }
    setQueuedRunByCell((prev) => markQueuedCells(prev, targets.map((cell) => cell.id)))
    await enqueueExecution('Target run', () =>
      executeQueuedSqlRun({
        label: 'Target run',
        cells: targets,
        flushReason: 'running target SQL cells',
        mode: 'sequence',
      })
    )
  }

  function deleteCellById(cellId: string) {
    deleteCellMutation.mutate(cellId)
  }

  async function flushPendingSaves(reason?: string) {
    const notebookId = activeNotebookIdRef.current
    const entries = getPendingSaveEntries(pendingSavePayloadRef.current)
    if (!notebookId || !entries.length) return true

    setStatus(reason ? `Saving pending changes before ${reason}...` : 'Saving pending changes...')

    for (const entry of entries) {
      const timer = saveTimersRef.current[entry.cellId]
      if (timer) clearTimeout(timer)
      delete saveTimersRef.current[entry.cellId]
    }

    pendingSavePayloadRef.current = {}
    setPendingSaveByCell({})

    const failedEntries: Array<{ cellId: string; payload: { content?: string; metadata?: NotebookWidgetMetadata | null }; error: unknown }> = []

    await Promise.all(
      entries.map(async (entry) => {
        try {
          await updateCell(notebookId, { cellId: entry.cellId, ...entry.payload })
        } catch (error) {
          failedEntries.push({ ...entry, error })
        }
      })
    )

    if (failedEntries.length) {
      pendingSavePayloadRef.current = Object.fromEntries(failedEntries.map((entry) => [entry.cellId, entry.payload]))
      setPendingSaveByCell(Object.fromEntries(failedEntries.map((entry) => [entry.cellId, true])))
      setSaveErrorByCell(
        Object.fromEntries(
          failedEntries.map((entry) => [entry.cellId, entry.error instanceof Error ? entry.error.message : String(entry.error)])
        )
      )
      const firstError = failedEntries[0]?.error
      setStatus(firstError instanceof Error ? firstError.message : String(firstError))
      return false
    }

    setSaveErrorByCell({})
    void queryClient.invalidateQueries({ queryKey: ['notebook', notebookId] })
    setStatus('All changes saved')
    return true
  }

  const pendingSaveCount = useMemo(() => getPendingSaveCount(pendingSaveByCell), [pendingSaveByCell])
  const staleResultByCell = useMemo(
    () => getStaleResultByCell({ sortedCells, draftByCell, resultsByCell, lastExecutedQueryByCell }),
    [sortedCells, draftByCell, resultsByCell, lastExecutedQueryByCell]
  )
  const cellUiStateByCell = useMemo(
    () =>
      getCellUiStateByCell({
        sortedCells,
        pendingSaveByCell,
        saveErrorByCell,
        queuedRunByCell,
        runningCellId,
        staleResultByCell,
      }),
    [sortedCells, pendingSaveByCell, saveErrorByCell, queuedRunByCell, runningCellId, staleResultByCell]
  )

  return {
    addCellMutation,
    cellSectionRefs,
    deleteCellById,
    draftByCell,
    inputValues,
    inputKeys,
    jumpToInputCell,
    moveCell,
    notebookInputs,
    onChangeCell,
    cellUiStateByCell,
    pendingSaveByCell,
    pendingSaveCount,
    previewMarkdown,
    resultsByCell,
    queuedRunByCell,
    saveErrorByCell,
    staleResultByCell,
    runTargetSqlCells,
    runAllSqlCells,
    runningAll,
    runningCellId,
    runSqlCellWithShortcuts,
    selectedCellId,
    selectedInsertParamByCell,
    setPreviewMarkdown,
    setSelectedCellId,
    setSelectedInsertParamByCell,
    sortedCells,
    sqlEditorRefs,
    toggleCellCollapsed,
    flushPendingSaves,
    insertParamIntoSqlCell,
    widgetDraftByCell,
    onWidgetMetadataChange,
  }
}

export function getChangedWidgetParamKeys(previous: NotebookWidgetMetadata, next: NotebookWidgetMetadata) {
  const previousParams = getWidgetParamValues(previous)
  const nextParams = getWidgetParamValues(next)
  const keys = new Set([...Object.keys(previousParams), ...Object.keys(nextParams)])

  return [...keys].filter((key) => !isSameValue(previousParams[key], nextParams[key]))
}

export function syncCellDraftState(input: {
  cells: NotebookCell[]
  previousDrafts: Record<string, string>
  previousServerContent: Record<string, string>
  pendingSavePayloads: Record<string, { content?: string; metadata?: NotebookWidgetMetadata | null }>
}) {
  const drafts: Record<string, string> = {}
  const serverContentByCell: Record<string, string> = {}

  for (const cell of input.cells) {
    const previousDraft = input.previousDrafts[cell.id]
    const previousServerContent = input.previousServerContent[cell.id]
    const hasPendingContentSave = input.pendingSavePayloads[cell.id]?.content !== undefined

    serverContentByCell[cell.id] = cell.content

    if (previousDraft === undefined) {
      drafts[cell.id] = cell.content
      continue
    }

    const draftStillMatchesPreviousServer =
      previousServerContent !== undefined && previousDraft === previousServerContent

    if (!hasPendingContentSave && draftStillMatchesPreviousServer) {
      drafts[cell.id] = cell.content
      continue
    }

    drafts[cell.id] = previousDraft
  }

  return { drafts, serverContentByCell }
}

export function syncWidgetDraftState(input: {
  cells: NotebookCell[]
  previousDrafts: Record<string, NotebookWidgetMetadata>
  previousServerMetadata: Record<string, NotebookWidgetMetadata>
  pendingSavePayloads: Record<string, { content?: string; metadata?: NotebookWidgetMetadata | null }>
}) {
  const drafts: Record<string, NotebookWidgetMetadata> = {}
  const serverMetadataByCell: Record<string, NotebookWidgetMetadata> = {}

  for (const cell of input.cells) {
    if (cell.type !== 'widget') continue

    const serverMetadata = getNormalizedWidgetMetadata(cell)
    const previousDraft = input.previousDrafts[cell.id]
    const previousServerMetadata = input.previousServerMetadata[cell.id]
    const hasPendingMetadataSave = input.pendingSavePayloads[cell.id]?.metadata !== undefined

    serverMetadataByCell[cell.id] = serverMetadata

    if (!previousDraft) {
      drafts[cell.id] = serverMetadata
      continue
    }

    const draftStillMatchesPreviousServer =
      previousServerMetadata !== undefined && isSameValue(previousDraft, previousServerMetadata)

    if (!hasPendingMetadataSave && draftStillMatchesPreviousServer) {
      drafts[cell.id] = serverMetadata
      continue
    }

    drafts[cell.id] = previousDraft
  }

  return { drafts, serverMetadataByCell }
}

export function syncCellResultState(input: {
  cells: NotebookCell[]
  previousResults: Record<string, QueryResult>
  previousServerResults: Record<string, QueryResult | null>
}) {
  const results: Record<string, QueryResult> = {}
  const serverResultsByCell: Record<string, QueryResult | null> = {}

  for (const cell of input.cells) {
    if (cell.type !== 'sql') continue

    const serverResult = cell.last_result_json ?? null
    const previousResult = input.previousResults[cell.id]
    const previousServerResult = input.previousServerResults[cell.id]

    serverResultsByCell[cell.id] = serverResult

    if (previousResult === undefined) {
      if (serverResult) {
        results[cell.id] = serverResult
      }
      continue
    }

    const resultStillMatchesPreviousServer =
      previousServerResult !== undefined && isSameValue(previousResult, previousServerResult)

    if (resultStillMatchesPreviousServer) {
      if (serverResult) {
        results[cell.id] = serverResult
      }
      continue
    }

    results[cell.id] = previousResult
  }

  return { results, serverResultsByCell }
}

export function syncExecutedQueryState(input: {
  cells: NotebookCell[]
  previousExecutedQueryByCell: Record<string, string>
  previousServerExecutedQueryByCell: Record<string, string>
}) {
  const executedQueryByCell: Record<string, string> = {}
  const serverExecutedQueryByCell: Record<string, string> = {}

  for (const cell of input.cells) {
    if (cell.type !== 'sql' || !cell.last_result_json) continue

    const serverExecutedQuery = cell.content
    const previousExecutedQuery = input.previousExecutedQueryByCell[cell.id]
    const previousServerExecutedQuery = input.previousServerExecutedQueryByCell[cell.id]

    serverExecutedQueryByCell[cell.id] = serverExecutedQuery

    if (previousExecutedQuery === undefined) {
      executedQueryByCell[cell.id] = serverExecutedQuery
      continue
    }

    if (previousExecutedQuery === previousServerExecutedQuery) {
      executedQueryByCell[cell.id] = serverExecutedQuery
      continue
    }

    executedQueryByCell[cell.id] = previousExecutedQuery
  }

  return { executedQueryByCell, serverExecutedQueryByCell }
}

export function clearPendingSaveCell(pendingSaveByCell: Record<string, boolean>, cellId: string) {
  if (!pendingSaveByCell[cellId]) return pendingSaveByCell
  const next = { ...pendingSaveByCell }
  delete next[cellId]
  return next
}

export function clearSaveError(saveErrorByCell: Record<string, string>, cellId: string) {
  if (!saveErrorByCell[cellId]) return saveErrorByCell
  const next = { ...saveErrorByCell }
  delete next[cellId]
  return next
}

export function getPendingSaveCount(pendingSaveByCell: Record<string, boolean>) {
  return Object.values(pendingSaveByCell).filter(Boolean).length
}

export function getPendingSaveEntries(
  pendingSavePayloads: Record<string, { content?: string; metadata?: NotebookWidgetMetadata | null }>
) {
  return Object.entries(pendingSavePayloads).map(([cellId, payload]) => ({ cellId, payload }))
}

export function getStaleResultByCell(input: {
  sortedCells: NotebookCell[]
  draftByCell: Record<string, string>
  resultsByCell: Record<string, QueryResult>
  lastExecutedQueryByCell: Record<string, string>
}) {
  const staleByCell: Record<string, boolean> = {}

  for (const cell of input.sortedCells) {
    if (cell.type !== 'sql') continue
    if (!input.resultsByCell[cell.id]) continue

    const currentQuery = (input.draftByCell[cell.id] ?? cell.content).trim()
    const lastExecutedQuery = (input.lastExecutedQueryByCell[cell.id] ?? '').trim()

    staleByCell[cell.id] = Boolean(lastExecutedQuery) && currentQuery !== lastExecutedQuery
  }

  return staleByCell
}

export function markQueuedCells(queuedRunByCell: Record<string, boolean>, cellIds: string[]) {
  if (!cellIds.length) return queuedRunByCell
  const next = { ...queuedRunByCell }
  for (const cellId of cellIds) next[cellId] = true
  return next
}

export function clearQueuedCells(queuedRunByCell: Record<string, boolean>, cellIds: string[]) {
  if (!cellIds.length) return queuedRunByCell
  const next = { ...queuedRunByCell }
  for (const cellId of cellIds) delete next[cellId]
  return next
}

export function getCellUiStateByCell(input: {
  sortedCells: NotebookCell[]
  pendingSaveByCell: Record<string, boolean>
  saveErrorByCell: Record<string, string>
  queuedRunByCell: Record<string, boolean>
  runningCellId: string
  staleResultByCell: Record<string, boolean>
}) {
  const stateByCell: Record<string, 'idle' | 'saving' | 'save_failed' | 'queued' | 'running' | 'stale_result'> = {}

  for (const cell of input.sortedCells) {
    if (input.runningCellId === cell.id) {
      stateByCell[cell.id] = 'running'
      continue
    }
    if (input.pendingSaveByCell[cell.id]) {
      stateByCell[cell.id] = 'saving'
      continue
    }
    if (input.saveErrorByCell[cell.id]) {
      stateByCell[cell.id] = 'save_failed'
      continue
    }
    if (input.queuedRunByCell[cell.id]) {
      stateByCell[cell.id] = 'queued'
      continue
    }
    if (input.staleResultByCell[cell.id]) {
      stateByCell[cell.id] = 'stale_result'
      continue
    }
    stateByCell[cell.id] = 'idle'
  }

  return stateByCell
}

function getNormalizedWidgetMetadata(cell: NotebookCell) {
  if (cell.metadata_json && typeof cell.metadata_json === 'object' && 'widgetType' in cell.metadata_json) {
    return normalizeWidgetMetadata(cell.metadata_json as NotebookWidgetMetadata) as NotebookWidgetMetadata
  }
  return createDefaultWidgetMetadata('callout') as NotebookWidgetMetadata
}

function isSameValue(a: unknown, b: unknown) {
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b)
  if (a && b && typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b)
  return a === b
}
