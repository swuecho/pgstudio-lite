import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import ThemeToggle from '../components/theme-toggle'
import { formatCell } from '../components/sql-editor/utils'
import type { QueryResult } from '../components/sql-editor/types'
import type { NotebookCell, NotebookCellType } from '../components/notebook/types'
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

const NOTEBOOKS_KEY = ['notebooks']

export default function NotebookPage() {
  const queryClient = useQueryClient()
  const [activeNotebookId, setActiveNotebookId] = useState<string>('')
  const [runningCellId, setRunningCellId] = useState<string>('')
  const [runningAll, setRunningAll] = useState(false)
  const [status, setStatus] = useState('Notebook ready')
  const [resultsByCell, setResultsByCell] = useState<Record<string, QueryResult>>({})
  const [draftByCell, setDraftByCell] = useState<Record<string, string>>({})
  const [previewMarkdown, setPreviewMarkdown] = useState<Record<string, boolean>>({})
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

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

  const sortedCells = useMemo(() => [...cells].sort((a, b) => a.position - b.position), [cells])

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
    mutationFn: (type: NotebookCellType) =>
      createCell(activeNotebookId, { type, content: type === 'sql' ? 'select now();' : '## Notes\n' }),
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
    mutationFn: ({ cellId, query }: { cellId: string; query: string }) => runCell(activeNotebookId, cellId, query),
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

  function scheduleCellSave(cell: NotebookCell, next: string) {
    if (!activeNotebookId) return
    const existing = saveTimersRef.current[cell.id]
    if (existing) clearTimeout(existing)
    saveTimersRef.current[cell.id] = setTimeout(() => {
      void updateCell(activeNotebookId, { cellId: cell.id, content: next })
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
    scheduleCellSave(cell, next)
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
        const result = await runCell(activeNotebookId, cell.id, query)
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
            <div className="empty-state">No cells yet. Add SQL or Markdown cells.</div>
          ) : (
            sortedCells.map((cell) => {
              const draft = draftByCell[cell.id] ?? cell.content
              const lastResult = resultsByCell[cell.id]
              const running = runningCellId === cell.id
              return (
                <section key={cell.id} className={`notebook-cell ${cell.collapsed ? 'compact' : ''}`}>
                  <div className="notebook-cell-head">
                    <span className="pill">{cell.type === 'markdown' ? 'MD' : 'SQL'}</span>
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
                          <textarea
                            className="notebook-sql"
                            value={draft}
                            onChange={(event) => onChangeCell(cell, event.target.value)}
                            spellCheck={false}
                          />
                          <div className="notebook-run-row">
                            <button
                              className="btn primary"
                              disabled={running || runningAll || !draft.trim()}
                              onClick={() => runCellMutation.mutate({ cellId: cell.id, query: draft })}
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
                          {lastResult ? <div className="notebook-compact-result"><CellResult result={lastResult} /></div> : <div className="empty-state">Run this cell to show result preview.</div>}
                        </>
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
