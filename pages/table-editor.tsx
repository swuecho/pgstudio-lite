import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import ThemeToggle from '../components/theme-toggle'

type TableInfo = {
  table: string
  schema: string
  estimatedRows: number
}

type ColumnInfo = {
  name: string
  dataType: string
  isNullable: boolean
  isIdentity: boolean
}

type RowData = Record<string, unknown> & { _ctid: string }

type Connection = { name: string }

async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`)
  return body as T
}

export default function TableEditorPage() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [connectionName, setConnectionName] = useState('default')
  const [tables, setTables] = useState<TableInfo[]>([])
  const [activeTable, setActiveTable] = useState('')
  const [columns, setColumns] = useState<ColumnInfo[]>([])
  const [rows, setRows] = useState<RowData[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [newRowJson, setNewRowJson] = useState('{\n  \n}')
  const [status, setStatus] = useState('Ready')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [sortBy, setSortBy] = useState('_ctid')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [filterColumn, setFilterColumn] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [filterMode, setFilterMode] = useState<'contains' | 'equals'>('contains')

  const editableColumns = useMemo(
    () => columns.filter((c) => !c.isIdentity && c.name !== '_ctid'),
    [columns]
  )

  async function loadConnections() {
    const data = await fetchJson<{ connections: Connection[]; configured: boolean }>('/api/connections')
    setConnections(data.connections || [])
    if (data.connections[0]) setConnectionName(data.connections[0].name)
  }

  async function loadTables(conn = connectionName) {
    const data = await fetchJson<{ tables: TableInfo[] }>(
      `/api/tables?connectionName=${encodeURIComponent(conn)}`
    )
    setTables(data.tables || [])
    if (!activeTable && data.tables[0]) setActiveTable(data.tables[0].table)
  }

  async function loadRows(table = activeTable, conn = connectionName) {
    if (!table) return
    const params = new URLSearchParams({
      connectionName: conn,
      limit: String(pageSize),
      offset: String(page * pageSize),
      sortBy,
      sortOrder,
    })
    if (filterColumn && filterValue.trim()) {
      params.set('filterColumn', filterColumn)
      params.set('filterValue', filterValue.trim())
      params.set('filterMode', filterMode)
    }

    const data = await fetchJson<{ columns: ColumnInfo[]; rows: RowData[]; total: number }>(
      `/api/tables/${encodeURIComponent(table)}/rows?${params.toString()}`
    )
    setColumns(data.columns || [])
    setRows(data.rows || [])
    setTotalRows(Number(data.total || 0))
  }

  async function updateCell(ctid: string, column: string, value: string) {
    setStatus('Saving...')
    await fetchJson<{ ok: boolean }>(`/api/tables/${encodeURIComponent(activeTable)}/rows`, {
      method: 'PATCH',
      body: JSON.stringify({ connectionName, ctid, patch: { [column]: value } }),
    })
    setStatus('Saved')
    await loadRows()
  }

  async function deleteRow(ctid: string) {
    setStatus('Deleting...')
    await fetchJson<{ ok: boolean }>(`/api/tables/${encodeURIComponent(activeTable)}/rows`, {
      method: 'DELETE',
      body: JSON.stringify({ connectionName, ctid }),
    })
    setStatus('Deleted')
    await loadRows()
  }

  async function insertRow() {
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(newRowJson)
    } catch {
      setStatus('Invalid JSON for new row')
      return
    }

    setStatus('Inserting...')
    await fetchJson<{ ok: boolean }>(`/api/tables/${encodeURIComponent(activeTable)}/rows`, {
      method: 'POST',
      body: JSON.stringify({ connectionName, row: payload }),
    })
    setStatus('Inserted')
    await loadRows()
  }

  useEffect(() => {
    void loadConnections()
  }, [])

  useEffect(() => {
    if (!connectionName) return
    void loadTables(connectionName)
  }, [connectionName])

  useEffect(() => {
    if (!activeTable) return
    setPage(0)
  }, [activeTable, pageSize, sortBy, sortOrder, filterColumn, filterMode, filterValue])

  useEffect(() => {
    if (!activeTable) return
    void loadRows(activeTable, connectionName)
  }, [activeTable, connectionName, page, pageSize, sortBy, sortOrder, filterColumn, filterMode, filterValue])

  useEffect(() => {
    if (columns.length === 0) return
    if (sortBy !== '_ctid' && !columns.some((col) => col.name === sortBy)) {
      setSortBy('_ctid')
    }
    if (filterColumn && !columns.some((col) => col.name === filterColumn)) {
      setFilterColumn('')
    }
  }, [columns, filterColumn, sortBy])

  return (
    <div className="layout-root">
      <aside className="layout-rail">
        <Link className="rail-btn link-btn" href="/">SQL</Link>
        <button className="rail-btn active">TB</button>
      </aside>

      <aside className="layout-nav">
        <div className="layout-nav-header">
          <div className="nav-title">Table Editor</div>
        </div>

        <div className="layout-nav-controls">
          <select value={connectionName} onChange={(e) => setConnectionName(e.target.value)}>
            {connections.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
          <button className="btn small" onClick={() => void loadTables()}>Refresh</button>
        </div>

        <div className="layout-nav-list">
          {tables.map((table) => (
            <button
              key={`${table.schema}.${table.table}`}
              className={`history-item ${activeTable === table.table ? 'active-item' : ''}`}
              onClick={() => setActiveTable(table.table)}
            >
              <div className="history-query">{table.table}</div>
              <div className="history-meta">~{table.estimatedRows} rows</div>
            </button>
          ))}
        </div>
      </aside>

      <main className="layout-main">
        <div className="editor-panel-header">
          <div className="editor-title">Table Editor · {activeTable || '-'}</div>
          <div className="editor-header-right">
            <span className="status-pill">{status}</span>
            <ThemeToggle />
          </div>
        </div>

        <div className="table-page">
          <div className="table-grid-wrap">
            <div className="table-toolbar">
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="_ctid">Default order</option>
                {columns.map((col) => (
                  <option key={`sort-${col.name}`} value={col.name}>
                    Sort: {col.name}
                  </option>
                ))}
              </select>
              <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}>
                <option value="asc">ASC</option>
                <option value="desc">DESC</option>
              </select>
              <select value={filterColumn} onChange={(e) => setFilterColumn(e.target.value)}>
                <option value="">Filter column</option>
                {columns.map((col) => (
                  <option key={`filter-${col.name}`} value={col.name}>
                    {col.name}
                  </option>
                ))}
              </select>
              <select value={filterMode} onChange={(e) => setFilterMode(e.target.value as 'contains' | 'equals')}>
                <option value="contains">contains</option>
                <option value="equals">equals</option>
              </select>
              <input
                className="cell-input"
                placeholder="Filter value"
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
              />
              <select value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value) || 50)}>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
            <table>
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col.name}>{col.name}</th>
                  ))}
                  <th>actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row._ctid}>
                    {columns.map((col) => {
                      if (col.name === '_ctid') {
                        return <td key={col.name}><code>{String(row[col.name] ?? '')}</code></td>
                      }
                      const readOnly = !editableColumns.some((c) => c.name === col.name)
                      return (
                        <td key={col.name}>
                          {readOnly ? (
                            <code>{String(row[col.name] ?? '')}</code>
                          ) : (
                            <input
                              className="cell-input"
                              defaultValue={String(row[col.name] ?? '')}
                              onBlur={(e) => {
                                const newValue = e.target.value
                                if (String(row[col.name] ?? '') !== newValue) {
                                  void updateCell(row._ctid, col.name, newValue)
                                }
                              }}
                            />
                          )}
                        </td>
                      )
                    })}
                    <td>
                      <button className="btn small danger" onClick={() => void deleteRow(row._ctid)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="table-pagination">
              <span className="history-meta">
                {totalRows} rows total · page {page + 1} / {Math.max(1, Math.ceil(totalRows / pageSize))}
              </span>
              <div className="history-actions">
                <button className="btn small" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  Prev
                </button>
                <button
                  className="btn small"
                  disabled={(page + 1) * pageSize >= totalRows}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className="insert-panel">
            <div className="nav-title">Insert Row (JSON)</div>
            <textarea value={newRowJson} onChange={(e) => setNewRowJson(e.target.value)} />
            <button className="btn primary" onClick={() => void insertRow()}>
              Insert
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
