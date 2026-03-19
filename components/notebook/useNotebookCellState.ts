import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { editor as MonacoEditorNs } from 'monaco-editor'
import type { QueryResult } from '../sql-editor/types'
import type {
  NotebookCell,
  NotebookCellType,
  NotebookDetail,
  NotebookInputValues,
  NotebookWidgetMetadata,
} from './types'
import {
  buildInputValues,
  getDependentSqlTargets,
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
  const [draftByCell, setDraftByCell] = useState<Record<string, string>>({})
  const [widgetDraftByCell, setWidgetDraftByCell] = useState<Record<string, NotebookWidgetMetadata>>({})
  const [selectedCellId, setSelectedCellId] = useState<string>('')
  const [selectedInsertParamByCell, setSelectedInsertParamByCell] = useState<Record<string, string>>({})
  const [previewMarkdown, setPreviewMarkdown] = useState<Record<string, boolean>>({})

  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingSavePayloadRef = useRef<Record<string, { content?: string; metadata?: NotebookWidgetMetadata | null }>>({})
  const reactiveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const reactiveRunGenerationRef = useRef(0)
  const sqlEditorRefs = useRef<Record<string, MonacoEditorNs.IStandaloneCodeEditor>>({})
  const cellSectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const draftByCellRef = useRef<Record<string, string>>({})
  const widgetDraftByCellRef = useRef<Record<string, NotebookWidgetMetadata>>({})
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
    sortedCellsRef.current = sortedCells
  }, [sortedCells])

  useEffect(() => {
    activeNotebookIdRef.current = activeNotebookId
  }, [activeNotebookId])

  useEffect(() => {
    setSelectedCellId('')
  }, [activeNotebookId])

  useEffect(() => {
    runningCellIdRef.current = runningCellId
  }, [runningCellId])

  useEffect(() => {
    runningAllRef.current = runningAll
  }, [runningAll])

  useEffect(() => {
    if (!cells.length) return
    setDraftByCell((prev) => {
      const next = { ...prev }
      for (const cell of cells) {
        if (next[cell.id] === undefined) next[cell.id] = cell.content
      }
      return next
    })
  }, [cells])

  useEffect(() => {
    if (!cells.length) return
    setWidgetDraftByCell((prev) => {
      const next = { ...prev }
      for (const cell of cells) {
        if (cell.type !== 'widget') continue
        if (next[cell.id] !== undefined) continue
        if (cell.metadata_json && typeof cell.metadata_json === 'object' && 'widgetType' in cell.metadata_json) {
          next[cell.id] = normalizeWidgetMetadata(cell.metadata_json as NotebookWidgetMetadata) as NotebookWidgetMetadata
        } else {
          next[cell.id] = createDefaultWidgetMetadata('callout') as NotebookWidgetMetadata
        }
      }
      return next
    })
  }, [cells])

  useEffect(() => {
    if (!cells.length) return
    setResultsByCell((prev) => {
      const next = { ...prev }
      for (const cell of cells) {
        if (cell.type !== 'sql' || !cell.last_result_json || next[cell.id]) continue
        next[cell.id] = cell.last_result_json
      }
      return next
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

  const runCellMutation = useMutation({
    mutationFn: ({ cellId, query, inputValues }: { cellId: string; query: string; inputValues: NotebookInputValues }) =>
      runCell(activeNotebookId, cellId, query, inputValues),
    onMutate: ({ cellId }) => {
      setRunningCellId(cellId)
      setStatus('Running cell...')
    },
    onSuccess: (result, vars) => {
      setResultsByCell((prev) => ({ ...prev, [vars.cellId]: result }))
      setStatus('Cell executed')
      if (activeNotebookId) void queryClient.invalidateQueries({ queryKey: ['notebook', activeNotebookId] })
    },
    onError: (error) => setStatus(error instanceof Error ? error.message : String(error)),
    onSettled: () => {
      setRunningCellId('')
    },
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
    const existing = saveTimersRef.current[cell.id]
    if (existing) clearTimeout(existing)
    pendingSavePayloadRef.current[cell.id] = {
      ...pendingSavePayloadRef.current[cell.id],
      ...patch,
    }

    saveTimersRef.current[cell.id] = setTimeout(() => {
      const payload = pendingSavePayloadRef.current[cell.id]
      delete pendingSavePayloadRef.current[cell.id]
      if (!payload) return
      void updateCell(activeNotebookId, { cellId: cell.id, ...payload })
        .then(() => {
          setStatus('Autosaved')
          void queryClient.invalidateQueries({ queryKey: ['notebook', activeNotebookId] })
        })
        .catch((error) => {
          setStatus(error instanceof Error ? error.message : String(error))
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

    const targets = [...new Map(
      keys.flatMap((key) => getDependentSqlTargets(getState(), inputCellId, key)).map((cell) => [cell.id, cell])
    ).values()]
    if (!targets.length) return

    const statusLabel = keys.length === 1 ? `'${keys[0]}'` : `${keys.length} widget input(s)`

    try {
      setStatus(`Input ${statusLabel} changed. Re-running ${targets.length} SQL cell(s)...`)
      for (const target of targets) {
        const state = getState()
        const notebookId = state.activeNotebookId
        if (!notebookId || state.runningAll || reactiveRunGenerationRef.current !== generation) continue

        const query = (state.draftByCell[target.id] ?? target.content).trim()
        if (!query) continue

        setRunningCellId(target.id)
        const result = await runCell(notebookId, target.id, query, buildInputValues(state.sortedCells, state.widgetDraftByCell))
        if (reactiveRunGenerationRef.current !== generation) return
        setResultsByCell((prev) => ({ ...prev, [target.id]: result }))
      }
      setStatus(`Auto-run completed for ${statusLabel}`)
    } catch (error) {
      setStatus(`Auto-run stopped: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setRunningCellId('')
      if (activeNotebookIdRef.current) {
        void queryClient.invalidateQueries({ queryKey: ['notebook', activeNotebookIdRef.current] })
      }
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
    if (!query || runningAll || Boolean(runningCellId)) return
    try {
      await runCellMutation.mutateAsync({ cellId: cell.id, query, inputValues })
      if (runAndFocusNext) focusNextSqlEditor(cell.id)
    } catch {
      // Status and errors are already surfaced by mutation callbacks.
    }
  }

  async function runAllSqlCells() {
    if (!activeNotebookId || runningAll) return
    const sqlCells = sortedCells.filter((cell) => cell.type === 'sql')
    if (!sqlCells.length) {
      setStatus('No SQL cells to run')
      return
    }

    setRunningAll(true)
    let successCount = 0

    try {
      for (const cell of sqlCells) {
        const query = (draftByCell[cell.id] ?? cell.content).trim()
        if (!query) continue
        setRunningCellId(cell.id)
        setStatus(`Running cell #${cell.position + 1}...`)
        const result = await runCell(
          activeNotebookId,
          cell.id,
          query,
          buildInputValues(sortedCells, widgetDraftByCellRef.current)
        )
        setResultsByCell((prev) => ({ ...prev, [cell.id]: result }))
        successCount += 1
      }
      setStatus(`Run all completed (${successCount}/${sqlCells.length})`)
    } catch (error) {
      setStatus(`Run all stopped: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setRunningCellId('')
      setRunningAll(false)
      if (activeNotebookId) void queryClient.invalidateQueries({ queryKey: ['notebook', activeNotebookId] })
    }
  }

  async function runTargetSqlCells(cellIds: string[]) {
    if (!activeNotebookId || runningAll) return
    const targets = sortedCells.filter((cell) => cell.type === 'sql' && cellIds.includes(cell.id))
    if (!targets.length) {
      setStatus('No target SQL cells found')
      return
    }

    setRunningAll(true)
    let successCount = 0
    try {
      for (const cell of targets) {
        const query = (draftByCell[cell.id] ?? cell.content).trim()
        if (!query) continue
        setRunningCellId(cell.id)
        setStatus(`Running target cell #${cell.position + 1}...`)
        const result = await runCell(activeNotebookId, cell.id, query, buildInputValues(sortedCells, widgetDraftByCellRef.current))
        setResultsByCell((prev) => ({ ...prev, [cell.id]: result }))
        successCount += 1
      }
      setStatus(`Target run completed (${successCount}/${targets.length})`)
    } catch (error) {
      setStatus(`Target run stopped: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setRunningCellId('')
      setRunningAll(false)
      if (activeNotebookId) void queryClient.invalidateQueries({ queryKey: ['notebook', activeNotebookId] })
    }
  }

  function deleteCellById(cellId: string) {
    deleteCellMutation.mutate(cellId)
  }

  return {
    addCellMutation,
    cellSectionRefs,
    deleteCellById,
    draftByCell,
    inputKeys,
    jumpToInputCell,
    moveCell,
    notebookInputs,
    onChangeCell,
    previewMarkdown,
    resultsByCell,
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

function isSameValue(a: unknown, b: unknown) {
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b)
  return a === b
}
