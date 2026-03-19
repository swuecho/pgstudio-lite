import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { editor as MonacoEditorNs } from 'monaco-editor'
import { useConnections } from '../shared/hooks/useConnections'
import { useNotebookImport } from './useNotebookImport'
import type { QueryResult } from '../sql-editor/types'
import type { Notebook, NotebookCell, NotebookCellType, NotebookInputCellMetadata, NotebookInputValues } from './types'
import {
  buildInputValues,
  getInputMetadata,
  runReactiveSqlCells,
  type ReactiveNotebookState,
} from '../../lib/notebook-reactive'
import {
  createCell,
  createNotebook,
  deleteCell,
  deleteNotebook,
  getNotebook,
  getNotebooks,
  runCell,
  updateCell,
  updateNotebook,
} from '../../features/notebook/notebook.service'
import { extractTemplateKeys } from '../../lib/notebook-params'
import { useSidebarResizer } from '../../hooks/useSidebarResizer'

const NOTEBOOKS_KEY = ['notebooks']

export type NotebookPageController = ReturnType<typeof useNotebookPageState>

export function useNotebookPageState() {
  const queryClient = useQueryClient()
  const [activeNotebookId, setActiveNotebookId] = useState<string>('')
  const [runningCellId, setRunningCellId] = useState<string>('')
  const [runningAll, setRunningAll] = useState(false)
  const [status, setStatus] = useState('Notebook ready')
  const [resultsByCell, setResultsByCell] = useState<Record<string, QueryResult>>({})
  const [draftByCell, setDraftByCell] = useState<Record<string, string>>({})
  const [inputDraftByCell, setInputDraftByCell] = useState<Record<string, NotebookInputCellMetadata>>({})
  const [selectedCellId, setSelectedCellId] = useState<string>('')
  const [selectedInsertParamByCell, setSelectedInsertParamByCell] = useState<Record<string, string>>({})
  const [previewMarkdown, setPreviewMarkdown] = useState<Record<string, boolean>>({})
  const [notebookSearch, setNotebookSearch] = useState('')
  const { sidebarWidth, handleWidthResizerMouseDown } = useSidebarResizer()

  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingSavePayloadRef = useRef<Record<string, { content?: string; metadata?: NotebookInputCellMetadata | null }>>({})
  const reactiveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const reactiveRunGenerationRef = useRef(0)
  const sqlEditorRefs = useRef<Record<string, MonacoEditorNs.IStandaloneCodeEditor>>({})
  const cellSectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const draftByCellRef = useRef<Record<string, string>>({})
  const inputDraftByCellRef = useRef<Record<string, NotebookInputCellMetadata>>({})
  const sortedCellsRef = useRef<NotebookCell[]>([])
  const activeNotebookIdRef = useRef('')
  const runningCellIdRef = useRef('')
  const runningAllRef = useRef(false)

  const connectionsQuery = useConnections()
  const connections = connectionsQuery.connections
  const notebooksQuery = useQuery({ queryKey: NOTEBOOKS_KEY, queryFn: () => getNotebooks() })
  const notebooks = notebooksQuery.data?.items || []

  useEffect(() => {
    if (!activeNotebookId && notebooks[0]?.id) setActiveNotebookId(notebooks[0].id)
    if (activeNotebookId && !notebooks.some((n) => n.id === activeNotebookId)) {
      setActiveNotebookId(notebooks[0]?.id || '')
    }
  }, [activeNotebookId, notebooks])

  const detailQuery = useQuery({
    queryKey: ['notebook', activeNotebookId],
    queryFn: () => getNotebook(activeNotebookId),
    enabled: Boolean(activeNotebookId),
  })

  const activeNotebook = detailQuery.data?.notebook
  const cells = detailQuery.data?.cells || []
  const sortedCells = useMemo(() => [...cells].sort((a, b) => a.position - b.position), [cells])
  const notebookImport = useNotebookImport({
    activeNotebookId,
    setActiveNotebookId,
    setStatus,
  })

  useEffect(() => {
    draftByCellRef.current = draftByCell
  }, [draftByCell])

  useEffect(() => {
    inputDraftByCellRef.current = inputDraftByCell
  }, [inputDraftByCell])

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
    setInputDraftByCell((prev) => {
      const next = { ...prev }
      for (const cell of cells) {
        if (cell.type !== 'input') continue
        if (next[cell.id] !== undefined) continue
        next[cell.id] = getInputMetadata(cell, next) || defaultInputMetadata()
      }
      return next
    })
  }, [cells])

  useEffect(() => {
    if (!cells.length) return
    setResultsByCell((prev) => {
      const next = { ...prev }
      for (const cell of cells) {
        if (cell.type !== 'sql') continue
        if (!cell.last_result_json) continue
        if (!next[cell.id]) next[cell.id] = cell.last_result_json
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      const typing = Boolean(target?.isContentEditable) || tag === 'input' || tag === 'textarea' || tag === 'select'

      if (event.key === 'Escape') {
        if (notebookImport.showImportModal) {
          event.preventDefault()
          notebookImport.setShowImportModal(false)
        } else if (notebookImport.showHelp) {
          event.preventDefault()
          notebookImport.setShowHelp(false)
        }
        return
      }

      if (!(event.metaKey || event.ctrlKey) || typing) return

      const key = event.key.toLowerCase()
      if (key === 'i') {
        event.preventDefault()
        notebookImport.setShowImportModal(true)
        return
      }
      if (key === 'e') {
        event.preventDefault()
        notebookImport.exportNotebookJson()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [notebookImport])

  const inputValues = useMemo(() => buildInputValues(sortedCells, inputDraftByCell), [sortedCells, inputDraftByCell])
  const inputKeys = useMemo(() => new Set(Object.keys(inputValues)), [inputValues])
  const notebookInputs = useMemo(
    () =>
      sortedCells
        .filter((cell) => cell.type === 'input')
        .map((cell) => inputDraftByCell[cell.id] || getInputMetadata(cell, inputDraftByCell))
        .filter((metadata): metadata is NotebookInputCellMetadata => Boolean(metadata))
        .filter((metadata) => metadata.key)
        .map((metadata) => ({ key: metadata.key, label: metadata.label, inputType: metadata.inputType })),
    [sortedCells, inputDraftByCell]
  )
  const inputCellIdByKey = useMemo(() => {
    const out: Record<string, string> = {}
    for (const cell of sortedCells) {
      if (cell.type !== 'input') continue
      const metadata = inputDraftByCell[cell.id] || getInputMetadata(cell, inputDraftByCell)
      if (!metadata?.key) continue
      out[metadata.key] = cell.id
    }
    return out
  }, [sortedCells, inputDraftByCell])

  const createNotebookMutation = useMutation({
    mutationFn: async () => {
      const connectionName = connectionsQuery.defaultConnectionName || connections[0]?.name
      return createNotebook(`Notebook ${notebooks.length + 1}`, connectionName)
    },
    onSuccess: (data) => {
      setStatus('Notebook created')
      setActiveNotebookId(data.item.id)
      void queryClient.invalidateQueries({ queryKey: NOTEBOOKS_KEY })
    },
    onError: (error) => setStatus(error instanceof Error ? error.message : String(error)),
  })

  const renameNotebookMutation = useMutation({
    mutationFn: (payload: { id: string; title: string }) => updateNotebook(payload.id, { title: payload.title }),
    onSuccess: () => {
      setStatus('Notebook renamed')
      void queryClient.invalidateQueries({ queryKey: NOTEBOOKS_KEY })
      if (activeNotebookId) void queryClient.invalidateQueries({ queryKey: ['notebook', activeNotebookId] })
    },
    onError: (error) => setStatus(error instanceof Error ? error.message : String(error)),
  })

  const changeNotebookConnectionMutation = useMutation({
    mutationFn: (payload: { id: string; connectionName: string }) =>
      updateNotebook(payload.id, { connectionName: payload.connectionName }),
    onSuccess: () => {
      setStatus('Notebook connection updated')
      void queryClient.invalidateQueries({ queryKey: NOTEBOOKS_KEY })
      if (activeNotebookId) void queryClient.invalidateQueries({ queryKey: ['notebook', activeNotebookId] })
    },
    onError: (error) => setStatus(error instanceof Error ? error.message : String(error)),
  })

  const deleteNotebookMutation = useMutation({
    mutationFn: (id: string) => deleteNotebook(id),
    onSuccess: () => {
      setStatus('Notebook deleted')
      void queryClient.invalidateQueries({ queryKey: NOTEBOOKS_KEY })
    },
    onError: (error) => setStatus(error instanceof Error ? error.message : String(error)),
  })

  const addCellMutation = useMutation({
    mutationFn: (type: NotebookCellType) => {
      const selectedIndex = sortedCells.findIndex((cell) => cell.id === selectedCellId)
      const position = selectedIndex === -1 ? undefined : selectedIndex + 1
      if (type === 'sql') return createCell(activeNotebookId, { type, content: 'select now();', position })
      if (type === 'markdown') return createCell(activeNotebookId, { type, content: '## Notes\n', position })
      return createCell(activeNotebookId, { type: 'input', metadata: defaultInputMetadata(), position })
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

  function scheduleCellSave(cell: NotebookCell, patch: { content?: string; metadata?: NotebookInputCellMetadata | null }) {
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

  function scheduleReactiveRuns(inputCellId: string, metadata: NotebookInputCellMetadata) {
    const timer = reactiveTimersRef.current[inputCellId]
    if (timer) clearTimeout(timer)
    if (metadata.autoRun === false) return
    reactiveTimersRef.current[inputCellId] = setTimeout(() => {
      void rerunDependentSqlCells(inputCellId, metadata.key)
    }, 350)
  }

  function onInputMetadataChange(cell: NotebookCell, next: NotebookInputCellMetadata) {
    const previous = inputDraftByCellRef.current[cell.id] || getInputMetadata(cell, inputDraftByCellRef.current) || defaultInputMetadata()
    const nextDrafts = { ...inputDraftByCellRef.current, [cell.id]: next }
    inputDraftByCellRef.current = nextDrafts
    setInputDraftByCell(nextDrafts)
    scheduleCellSave(cell, { metadata: next })

    if (isSameValue(previous.value, next.value) && previous.key === next.key) return
    scheduleReactiveRuns(cell.id, next)
  }

  async function rerunDependentSqlCells(inputCellId: string, inputKey: string) {
    const generation = reactiveRunGenerationRef.current + 1
    reactiveRunGenerationRef.current = generation

    const getState = (): ReactiveNotebookState => ({
      activeNotebookId: activeNotebookIdRef.current,
      runningAll: runningAllRef.current,
      runningCellId: runningCellIdRef.current,
      sortedCells: sortedCellsRef.current,
      draftByCell: draftByCellRef.current,
      inputDraftByCell: inputDraftByCellRef.current,
    })

    const targets = getState().sortedCells.filter((cell) => {
      if (cell.type !== 'sql') return false
      const query = getState().draftByCell[cell.id] ?? cell.content
      return extractTemplateKeys(query).includes(inputKey)
    })
    if (!targets.length) return

    try {
      setStatus(`Input '${inputKey}' changed. Re-running ${targets.length} SQL cell(s)...`)
      await runReactiveSqlCells({
        inputCellId,
        inputKey,
        getState,
        runCell: async ({ notebookId, cellId, query, inputValues }) => {
          if (reactiveRunGenerationRef.current !== generation) return
          setRunningCellId(cellId)
          const result = await runCell(notebookId, cellId, query, inputValues)
          if (reactiveRunGenerationRef.current !== generation) return
          setResultsByCell((prev) => ({ ...prev, [cellId]: result }))
        },
      })
      setStatus(`Auto-run completed for '${inputKey}'`)
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
        const result = await runCell(activeNotebookId, cell.id, query, buildInputValues(sortedCells, inputDraftByCell))
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

  function renameNotebook(item: Notebook, nextTitle: string) {
    renameNotebookMutation.mutate({ id: item.id, title: nextTitle })
  }

  function removeNotebook(notebookId: string) {
    deleteNotebookMutation.mutate(notebookId)
  }

  function deleteCellById(cellId: string) {
    deleteCellMutation.mutate(cellId)
  }

  function updateNotebookConnection(connectionName: string) {
    if (!activeNotebook?.id) return
    changeNotebookConnectionMutation.mutate({ id: activeNotebook.id, connectionName })
  }

  return {
    activeNotebookId,
    setActiveNotebookId,
    activeNotebook,
    addCellMutation,
    cellSectionRefs,
    connections,
    createNotebookMutation,
    deleteCellById,
    detailQuery,
    draftByCell,
    handleWidthResizerMouseDown,
    inputDraftByCell,
    inputKeys,
    jumpToInputCell,
    moveCell,
    notebookImport,
    notebookInputs,
    notebooks,
    notebookSearch,
    onChangeCell,
    onInputMetadataChange,
    previewMarkdown,
    removeNotebook,
    renameNotebook,
    resultsByCell,
    runAllSqlCells,
    runningAll,
    runningCellId,
    runSqlCellWithShortcuts,
    selectedCellId,
    selectedInsertParamByCell,
    setNotebookSearch,
    setPreviewMarkdown,
    setSelectedCellId,
    setSelectedInsertParamByCell,
    sidebarWidth,
    sortedCells,
    sqlEditorRefs,
    status,
    toggleCellCollapsed,
    updateNotebookConnection,
    insertParamIntoSqlCell,
  }
}

function defaultInputMetadata(): NotebookInputCellMetadata {
  return {
    key: `param_${Math.random().toString(36).slice(2, 8)}`,
    label: 'Input',
    inputType: 'text',
    value: '',
    required: false,
    autoRun: true,
  }
}

function isSameValue(a: unknown, b: unknown) {
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b)
  return a === b
}
