import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { editor as MonacoEditorNs } from 'monaco-editor'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import ThemeToggle from '../components/theme-toggle'
import { InputCellEditor } from '../components/notebook/InputCellEditor'
import { SqlCellEditor } from '../components/notebook/SqlCellEditor'
import { formatCell } from '../components/sql-editor/utils'
import type { QueryResult } from '../components/sql-editor/types'
import type { NotebookCell, NotebookCellType, NotebookInputCellMetadata, NotebookInputValues } from '../components/notebook/types'
import {
  createCell,
  createNotebook,
  deleteCell,
  deleteNotebook,
  getConnections,
  getNotebook,
  getNotebooks,
  runCell,
  updateCell,
  updateNotebook,
} from '../features/notebook/notebook.service'
import { extractTemplateKeys } from '../lib/notebook-params'

const NOTEBOOKS_KEY = ['notebooks']

export default function NotebookPage() {
  const queryClient = useQueryClient()
  const [activeNotebookId, setActiveNotebookId] = useState<string>('')
  const [runningCellId, setRunningCellId] = useState<string>('')
  const [runningAll, setRunningAll] = useState(false)
  const [status, setStatus] = useState('Notebook ready')
  const [resultsByCell, setResultsByCell] = useState<Record<string, QueryResult>>({})
  const [draftByCell, setDraftByCell] = useState<Record<string, string>>({})
  const [inputDraftByCell, setInputDraftByCell] = useState<Record<string, NotebookInputCellMetadata>>({})
  const [selectedInsertParamByCell, setSelectedInsertParamByCell] = useState<Record<string, string>>({})
  const [previewMarkdown, setPreviewMarkdown] = useState<Record<string, boolean>>({})

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

  const connectionsQuery = useQuery({ queryKey: ['connections', 'notebook'], queryFn: () => getConnections() })
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
        next[cell.id] = toInputMetadata(cell)
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
    return () => {
      for (const timer of Object.values(saveTimersRef.current)) clearTimeout(timer)
      for (const timer of Object.values(reactiveTimersRef.current)) clearTimeout(timer)
    }
  }, [])

  const inputValues = useMemo(() => buildInputValues(sortedCells, inputDraftByCell), [sortedCells, inputDraftByCell])
  const inputKeys = useMemo(() => new Set(Object.keys(inputValues)), [inputValues])
  const notebookInputs = useMemo(
    () =>
      sortedCells
        .filter((cell) => cell.type === 'input')
        .map((cell) => inputDraftByCell[cell.id] || toInputMetadata(cell))
        .filter((metadata) => metadata.key)
        .map((metadata) => ({ key: metadata.key, label: metadata.label, inputType: metadata.inputType })),
    [sortedCells, inputDraftByCell]
  )
  const inputCellIdByKey = useMemo(() => {
    const out: Record<string, string> = {}
    for (const cell of sortedCells) {
      if (cell.type !== 'input') continue
      const metadata = inputDraftByCell[cell.id] || toInputMetadata(cell)
      if (!metadata.key) continue
      out[metadata.key] = cell.id
    }
    return out
  }, [sortedCells, inputDraftByCell])

  const createNotebookMutation = useMutation({
    mutationFn: async () => {
      const connectionName =
        connectionsQuery.data?.connections.find((c) => c.isDefault)?.name || connectionsQuery.data?.connections[0]?.name
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
      if (type === 'sql') return createCell(activeNotebookId, { type, content: 'select now();' })
      if (type === 'markdown') return createCell(activeNotebookId, { type, content: '## Notes\n' })
      return createCell(activeNotebookId, { type: 'input', metadata: defaultInputMetadata() })
    },
    onSuccess: () => {
      setStatus('Cell added')
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
    onError: (error) => {
      setStatus(error instanceof Error ? error.message : String(error))
    },
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
    const previous = inputDraftByCellRef.current[cell.id] || toInputMetadata(cell)
    const nextDrafts = { ...inputDraftByCellRef.current, [cell.id]: next }
    inputDraftByCellRef.current = nextDrafts
    setInputDraftByCell(nextDrafts)
    scheduleCellSave(cell, { metadata: next })

    if (isSameValue(previous.value, next.value) && previous.key === next.key) return
    scheduleReactiveRuns(cell.id, next)
  }

  async function rerunDependentSqlCells(inputCellId: string, inputKey: string) {
    const activeId = activeNotebookIdRef.current
    const isRunningAll = runningAllRef.current
    const runningId = runningCellIdRef.current
    if (!activeId || isRunningAll || runningId) return

    const cellsNow = sortedCellsRef.current
    const sourceCell = cellsNow.find((cell) => cell.id === inputCellId)
    if (!sourceCell) return

    const targets = cellsNow.filter((cell) => {
      if (cell.type !== 'sql') return false
      if (cell.position <= sourceCell.position) return false
      const query = draftByCellRef.current[cell.id] ?? cell.content
      return extractTemplateKeys(query).includes(inputKey)
    })

    if (!targets.length) return

    const generation = reactiveRunGenerationRef.current + 1
    reactiveRunGenerationRef.current = generation

    try {
      setStatus(`Input '${inputKey}' changed. Re-running ${targets.length} SQL cell(s)...`)
      for (const target of targets) {
        if (reactiveRunGenerationRef.current !== generation) return
        const query = (draftByCellRef.current[target.id] ?? target.content).trim()
        if (!query) continue
        setRunningCellId(target.id)
        const result = await runCell(
          activeId,
          target.id,
          query,
          buildInputValues(cellsNow, inputDraftByCellRef.current)
        )
        if (reactiveRunGenerationRef.current !== generation) return
        setResultsByCell((prev) => ({ ...prev, [target.id]: result }))
      }
      setStatus(`Auto-run completed for '${inputKey}'`)
    } catch (error) {
      setStatus(`Auto-run stopped: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setRunningCellId('')
      if (activeId) void queryClient.invalidateQueries({ queryKey: ['notebook', activeId] })
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

  return (
    <div className="layout-root">
      <aside className="layout-rail">
        <Link className="rail-btn link-btn" href="/">
          SQL
        </Link>
        <Link className="rail-btn link-btn" href="/table-editor">
          TB
        </Link>
        <button className="rail-btn active">NB</button>
      </aside>

      <aside className="layout-nav">
        <div className="layout-nav-header">
          <div className="nav-title">Notebooks</div>
          <button className="btn small" onClick={() => createNotebookMutation.mutate()}>
            New
          </button>
        </div>

        <div className="layout-nav-controls">
          <input disabled value={status} readOnly />
        </div>

        <div className="layout-nav-list">
          {notebooks.map((item) => (
            <button
              key={item.id}
              className={`history-item ${item.id === activeNotebookId ? 'active-item' : ''}`}
              onClick={() => setActiveNotebookId(item.id)}
            >
              <div className="history-top">
                <span className="pill ok">Notebook</span>
                <span>{item.connection_name}</span>
              </div>
              <div className="history-query">{item.title}</div>
              <div className="history-actions">
                <button
                  type="button"
                  className="btn small"
                  onClick={(event) => {
                    event.stopPropagation()
                    const nextTitle = window.prompt('Rename notebook', item.title)
                    if (!nextTitle || !nextTitle.trim()) return
                    renameNotebookMutation.mutate({ id: item.id, title: nextTitle.trim() })
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="btn small danger"
                  onClick={(event) => {
                    event.stopPropagation()
                    if (!window.confirm(`Delete notebook '${item.title}'?`)) return
                    deleteNotebookMutation.mutate(item.id)
                  }}
                >
                  Delete
                </button>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="layout-main">
        <div className="editor-panel-header">
          <div className="editor-title">Notebook · {activeNotebook?.title || '-'}</div>
          <div className="editor-header-right">
            <span className="status-pill">{status}</span>
            <ThemeToggle />
            <select
              value={activeNotebook?.connection_name || ''}
              onChange={(event) => {
                if (!activeNotebook?.id) return
                changeNotebookConnectionMutation.mutate({ id: activeNotebook.id, connectionName: event.target.value })
              }}
            >
              {(connectionsQuery.data?.connections || []).map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                  {c.readOnly ? ' (read-only)' : ''}
                </option>
              ))}
            </select>
            <button className="btn small" disabled={!activeNotebookId || runningAll} onClick={() => addCellMutation.mutate('sql')}>
              Add SQL
            </button>
            <button
              className="btn small"
              disabled={!activeNotebookId || runningAll}
              onClick={() => addCellMutation.mutate('markdown')}
            >
              Add Markdown
            </button>
            <button className="btn small" disabled={!activeNotebookId || runningAll} onClick={() => addCellMutation.mutate('input')}>
              Add Input
            </button>
            <span className="history-meta">Ctrl/Cmd+Enter: Run · Shift+Enter: Run + Next SQL</span>
            <button className="btn primary" disabled={!activeNotebookId || runningAll} onClick={() => void runAllSqlCells()}>
              {runningAll ? 'Running All...' : 'Run All'}
            </button>
          </div>
        </div>

        <div className="notebook-canvas">
          {!activeNotebookId ? (
            <div className="empty-state">Create a notebook to begin.</div>
          ) : detailQuery.isLoading ? (
            <div className="empty-state">Loading notebook...</div>
          ) : sortedCells.length === 0 ? (
            <div className="empty-state">No cells yet. Add SQL, Input, or Markdown cells.</div>
          ) : (
            sortedCells.map((cell) => {
              const draft = draftByCell[cell.id] ?? cell.content
              const lastResult = resultsByCell[cell.id]
              const running = runningCellId === cell.id
              const inputMeta = cell.type === 'input' ? inputDraftByCell[cell.id] || toInputMetadata(cell) : null
              const sqlKeys = cell.type === 'sql' ? extractTemplateKeys(draft) : []
              const missingSqlKeys = sqlKeys.filter((key) => !inputKeys.has(key))
              const selectedInsertParam = selectedInsertParamByCell[cell.id] || notebookInputs[0]?.key || ''
              return (
                <section
                  key={cell.id}
                  ref={(element) => {
                    cellSectionRefs.current[cell.id] = element
                  }}
                  className={`notebook-cell ${cell.collapsed ? 'compact' : ''}`}
                >
                  <div className="notebook-cell-head">
                    <span className="pill">{cell.type === 'markdown' ? 'MD' : cell.type === 'input' ? 'IN' : 'SQL'}</span>
                    <span className="history-meta">#{cell.position + 1}</span>
                    {cell.last_run_at ? <span className="history-meta">Last run: {new Date(cell.last_run_at).toLocaleString()}</span> : null}
                    <div className="notebook-cell-actions">
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
                          <button className="btn small" onClick={() => deleteCellMutation.mutate(cell.id)}>
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
                            <div className="notebook-param-insert">
                              <select
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
                            <div className="notebook-sql-params">
                              <span className="history-meta">Inputs:</span>
                              {sqlKeys.map((key) => (
                                <button
                                  key={key}
                                  type="button"
                                  className={`pill notebook-param-chip ${missingSqlKeys.includes(key) ? 'error' : 'ok'}`}
                                  onClick={() => jumpToInputCell(key)}
                                  title={`Jump to input '${key}'`}
                                >
                                  {key}
                                </button>
                              ))}
                            </div>
                          ) : null}
                          <div className="notebook-run-row">
                            <button
                              className="btn primary"
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
                            <span className="history-meta">
                              {cell.last_duration_ms !== null ? `${cell.last_duration_ms}ms` : ''}
                              {cell.last_row_count !== null ? ` · ${cell.last_row_count} rows` : ''}
                            </span>
                          </div>
                          {cell.last_error ? <div className="empty-state">{cell.last_error}</div> : null}
                          {lastResult ? <CellResult result={lastResult} /> : null}
                        </>
                      ) : (
                        <>
                          <div className="notebook-compact-sql">{toCompactSqlPreview(draft)}</div>
                          {cell.last_error ? <div className="empty-state">{cell.last_error}</div> : null}
                          {lastResult ? (
                            <div className="notebook-compact-result">
                              <CellResult result={lastResult} />
                            </div>
                          ) : (
                            <div className="empty-state">Run this cell to show result preview.</div>
                          )}
                        </>
                      )}
                    </>
                  ) : cell.type === 'input' ? (
                    <>
                      {!cell.collapsed ? (
                        inputMeta ? (
                          <InputCellEditor
                            metadata={inputMeta}
                            disabled={runningAll}
                            onChange={(next) => onInputMetadataChange(cell, next)}
                          />
                        ) : null
                      ) : (
                        inputMeta ? (
                          <div className="notebook-input-compact">
                            <span className="notebook-input-key">{inputMeta.key || 'input'}</span>
                            <InputCellEditor
                              metadata={inputMeta}
                              valueOnly
                              showValueLabel={false}
                              disabled={runningAll}
                              onChange={(next) => onInputMetadataChange(cell, next)}
                            />
                          </div>
                        ) : null
                      )}
                    </>
                  ) : (
                    <>
                      {!cell.collapsed ? (
                        <div className="notebook-run-row">
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
                        <div className={`notebook-markdown-preview ${cell.collapsed ? 'compact' : ''}`}>
                          <MarkdownPreview source={draft} />
                        </div>
                      ) : (
                        <textarea
                          className="notebook-markdown"
                          value={draft}
                          onChange={(event) => onChangeCell(cell, event.target.value)}
                        />
                      )}
                    </>
                  )}
                </section>
              )
            })
          )}
        </div>
      </main>
    </div>
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

function toInputMetadata(cell: NotebookCell): NotebookInputCellMetadata {
  const metadata = cell.metadata_json
  if (metadata && metadata.key && metadata.label && metadata.inputType) return metadata
  return defaultInputMetadata()
}

function buildInputValues(cells: NotebookCell[], inputDraftByCell: Record<string, NotebookInputCellMetadata>) {
  const out: NotebookInputValues = {}
  for (const cell of cells) {
    if (cell.type !== 'input') continue
    const metadata = inputDraftByCell[cell.id] || toInputMetadata(cell)
    if (!metadata.key) continue
    out[metadata.key] = metadata.value
  }
  return out
}

function isSameValue(a: unknown, b: unknown) {
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b)
  return a === b
}

function MarkdownPreview({ source }: { source: string }) {
  return (
    <div className="notebook-markdown-render">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
          code: ({ className, children, ...props }) => {
            const isBlock = Boolean(className)
            if (!isBlock) return <code {...props}>{children}</code>
            return (
              <pre className="notebook-markdown-code">
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
