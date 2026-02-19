import { useEffect } from 'react'
import { fetchJson } from '../../lib/http'
import { ColumnInfo, Connection, RowData, TableInfo } from './types'

type TableEditorState = {
  connectionName: string
  setConnectionName: (value: string) => void
  tables: TableInfo[]
  setTables: (value: TableInfo[] | ((prev: TableInfo[]) => TableInfo[])) => void
  activeTable: string
  setActiveTable: (value: string) => void
  columns: ColumnInfo[]
  setColumns: (value: ColumnInfo[]) => void
  setRows: (value: RowData[]) => void
  setTotalRows: (value: number) => void
  newRowJson: string
  setStatus: (value: string) => void
  page: number
  setPage: (value: number | ((prev: number) => number)) => void
  pageSize: number
  sortBy: string
  setSortBy: (value: string) => void
  sortOrder: 'asc' | 'desc'
  filterColumn: string
  setFilterColumn: (value: string) => void
  filterValue: string
  filterMode: 'contains' | 'equals'
}

export function useTableEditorData(state: TableEditorState & { setConnections: (value: Connection[]) => void }) {
  async function loadConnections() {
    const data = await fetchJson<{ connections: Connection[]; configured: boolean }>('/api/connections')
    state.setConnections(data.connections || [])
    if (data.connections[0]) state.setConnectionName(data.connections[0].name)
  }

  async function loadTables(conn = state.connectionName) {
    const data = await fetchJson<{ tables: TableInfo[] }>(
      `/api/tables?connectionName=${encodeURIComponent(conn)}`
    )
    state.setTables(data.tables || [])
    if (!state.activeTable && data.tables[0]) state.setActiveTable(data.tables[0].table)
  }

  async function loadRows(table = state.activeTable, conn = state.connectionName) {
    if (!table) return
    const params = new URLSearchParams({
      connectionName: conn,
      limit: String(state.pageSize),
      offset: String(state.page * state.pageSize),
      sortBy: state.sortBy,
      sortOrder: state.sortOrder,
    })
    if (state.filterColumn && state.filterValue.trim()) {
      params.set('filterColumn', state.filterColumn)
      params.set('filterValue', state.filterValue.trim())
      params.set('filterMode', state.filterMode)
    }

    const data = await fetchJson<{ columns: ColumnInfo[]; rows: RowData[]; total: number }>(
      `/api/tables/${encodeURIComponent(table)}/rows?${params.toString()}`
    )
    state.setColumns(data.columns || [])
    state.setRows(data.rows || [])
    state.setTotalRows(Number(data.total || 0))
  }

  async function updateCell(ctid: string, column: string, value: string) {
    state.setStatus('Saving...')
    await fetchJson<{ ok: boolean }>(`/api/tables/${encodeURIComponent(state.activeTable)}/rows`, {
      method: 'PATCH',
      body: JSON.stringify({ connectionName: state.connectionName, ctid, patch: { [column]: value } }),
    })
    state.setStatus('Saved')
    await loadRows()
  }

  async function deleteRow(ctid: string) {
    state.setStatus('Deleting...')
    await fetchJson<{ ok: boolean }>(`/api/tables/${encodeURIComponent(state.activeTable)}/rows`, {
      method: 'DELETE',
      body: JSON.stringify({ connectionName: state.connectionName, ctid }),
    })
    state.setStatus('Deleted')
    await loadRows()
  }

  async function insertRow() {
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(state.newRowJson)
    } catch {
      state.setStatus('Invalid JSON for new row')
      return
    }

    state.setStatus('Inserting...')
    await fetchJson<{ ok: boolean }>(`/api/tables/${encodeURIComponent(state.activeTable)}/rows`, {
      method: 'POST',
      body: JSON.stringify({ connectionName: state.connectionName, row: payload }),
    })
    state.setStatus('Inserted')
    await loadRows()
  }

  useEffect(() => {
    void loadConnections()
  }, [])

  useEffect(() => {
    if (!state.connectionName) return
    void loadTables(state.connectionName)
  }, [state.connectionName])

  useEffect(() => {
    if (!state.activeTable) return
    state.setPage(0)
  }, [state.activeTable, state.pageSize, state.sortBy, state.sortOrder, state.filterColumn, state.filterMode, state.filterValue])

  useEffect(() => {
    if (!state.activeTable) return
    void loadRows(state.activeTable, state.connectionName)
  }, [state.activeTable, state.connectionName, state.page, state.pageSize, state.sortBy, state.sortOrder, state.filterColumn, state.filterMode, state.filterValue])

  useEffect(() => {
    if (state.columns.length === 0) return
    if (state.sortBy !== '_ctid' && !state.columns.some((col) => col.name === state.sortBy)) {
      state.setSortBy('_ctid')
    }
    if (state.filterColumn && !state.columns.some((col) => col.name === state.filterColumn)) {
      state.setFilterColumn('')
    }
  }, [state.columns, state.filterColumn, state.sortBy])

  return {
    loadTables,
    updateCell,
    deleteRow,
    insertRow,
  }
}
