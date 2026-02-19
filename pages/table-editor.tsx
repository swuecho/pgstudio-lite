import { useEffect, useMemo, useState } from 'react'
import ThemeToggle from '../components/theme-toggle'
import { InsertPanel } from '../components/table-editor/InsertPanel'
import { TableGridPanel } from '../components/table-editor/GridPanel'
import { TableSidebar } from '../components/table-editor/Sidebar'
import { ColumnInfo, Connection, RowData, TableInfo } from '../components/table-editor/types'
import { fetchJson } from '../lib/http'

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
      <TableSidebar
        connections={connections}
        connectionName={connectionName}
        onChangeConnection={setConnectionName}
        tables={tables}
        activeTable={activeTable}
        onSelectTable={setActiveTable}
        onRefreshTables={() => {
          void loadTables()
        }}
      />

      <main className="layout-main">
        <div className="editor-panel-header">
          <div className="editor-title">Table Editor · {activeTable || '-'}</div>
          <div className="editor-header-right">
            <span className="status-pill">{status}</span>
            <ThemeToggle />
          </div>
        </div>

        <div className="table-page">
          <TableGridPanel
            columns={columns}
            rows={rows}
            editableColumns={editableColumns}
            sortBy={sortBy}
            sortOrder={sortOrder}
            filterColumn={filterColumn}
            filterMode={filterMode}
            filterValue={filterValue}
            pageSize={pageSize}
            page={page}
            totalRows={totalRows}
            onChangeSortBy={setSortBy}
            onChangeSortOrder={setSortOrder}
            onChangeFilterColumn={setFilterColumn}
            onChangeFilterMode={setFilterMode}
            onChangeFilterValue={setFilterValue}
            onChangePageSize={setPageSize}
            onUpdateCell={(ctid, column, value) => {
              void updateCell(ctid, column, value)
            }}
            onDeleteRow={(ctid) => {
              void deleteRow(ctid)
            }}
            onPrevPage={() => setPage((p) => Math.max(0, p - 1))}
            onNextPage={() => setPage((p) => p + 1)}
          />

          <InsertPanel
            newRowJson={newRowJson}
            onChangeNewRowJson={setNewRowJson}
            onInsertRow={() => {
              void insertRow()
            }}
          />
        </div>
      </main>
    </div>
  )
}
