import { useEffect } from 'react'
import { ColumnInfo, Connection, RowData, TableInfo } from './types'
import {
  getConnections as getConnectionsService,
  getRows as getRowsService,
  getTables as getTablesService,
  insertRow as insertRowService,
  patchRow,
  removeRow,
} from '../../features/table/table.service'

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
    const data = await getConnectionsService()
    state.setConnections(data.connections || [])
    if (data.connections[0]) state.setConnectionName(data.connections[0].name)
  }

  async function loadTables(conn = state.connectionName) {
    const data = await getTablesService(conn)
    state.setTables(data.tables || [])
    if (!state.activeTable && data.tables[0]) state.setActiveTable(data.tables[0].table)
  }

  async function loadRows(table = state.activeTable, conn = state.connectionName) {
    if (!table) return
    const data = await getRowsService({
      table,
      connectionName: conn,
      page: state.page,
      pageSize: state.pageSize,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder,
      filterColumn: state.filterColumn,
      filterValue: state.filterValue,
      filterMode: state.filterMode,
    })
    state.setColumns(data.columns || [])
    state.setRows(data.rows || [])
    state.setTotalRows(Number(data.total || 0))
  }

  async function updateCell(ctid: string, column: string, value: string) {
    state.setStatus('Saving...')
    await patchRow(state.activeTable, {
      connectionName: state.connectionName,
      ctid,
      patch: { [column]: value },
    })
    state.setStatus('Saved')
    await loadRows()
  }

  async function deleteRow(ctid: string) {
    state.setStatus('Deleting...')
    await removeRow(state.activeTable, { connectionName: state.connectionName, ctid })
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
    await insertRowService(state.activeTable, { connectionName: state.connectionName, row: payload })
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
