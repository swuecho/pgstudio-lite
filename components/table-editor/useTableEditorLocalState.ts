import { useMemo } from 'react'
import { useTableEditorLocalStore } from './stores/tableEditorLocalStore'

export function useTableEditorLocalState() {
  const connections = useTableEditorLocalStore((s) => s.connections)
  const setConnections = useTableEditorLocalStore((s) => s.setConnections)
  const connectionName = useTableEditorLocalStore((s) => s.connectionName)
  const setConnectionName = useTableEditorLocalStore((s) => s.setConnectionName)
  const tables = useTableEditorLocalStore((s) => s.tables)
  const setTables = useTableEditorLocalStore((s) => s.setTables)
  const activeTable = useTableEditorLocalStore((s) => s.activeTable)
  const setActiveTable = useTableEditorLocalStore((s) => s.setActiveTable)
  const columns = useTableEditorLocalStore((s) => s.columns)
  const setColumns = useTableEditorLocalStore((s) => s.setColumns)
  const rows = useTableEditorLocalStore((s) => s.rows)
  const setRows = useTableEditorLocalStore((s) => s.setRows)
  const totalRows = useTableEditorLocalStore((s) => s.totalRows)
  const setTotalRows = useTableEditorLocalStore((s) => s.setTotalRows)
  const newRowJson = useTableEditorLocalStore((s) => s.newRowJson)
  const setNewRowJson = useTableEditorLocalStore((s) => s.setNewRowJson)
  const status = useTableEditorLocalStore((s) => s.status)
  const setStatus = useTableEditorLocalStore((s) => s.setStatus)
  const page = useTableEditorLocalStore((s) => s.page)
  const setPage = useTableEditorLocalStore((s) => s.setPage)
  const pageSize = useTableEditorLocalStore((s) => s.pageSize)
  const setPageSize = useTableEditorLocalStore((s) => s.setPageSize)
  const sortBy = useTableEditorLocalStore((s) => s.sortBy)
  const setSortBy = useTableEditorLocalStore((s) => s.setSortBy)
  const sortOrder = useTableEditorLocalStore((s) => s.sortOrder)
  const setSortOrder = useTableEditorLocalStore((s) => s.setSortOrder)
  const filterColumn = useTableEditorLocalStore((s) => s.filterColumn)
  const setFilterColumn = useTableEditorLocalStore((s) => s.setFilterColumn)
  const filterValue = useTableEditorLocalStore((s) => s.filterValue)
  const setFilterValue = useTableEditorLocalStore((s) => s.setFilterValue)
  const filterMode = useTableEditorLocalStore((s) => s.filterMode)
  const setFilterMode = useTableEditorLocalStore((s) => s.setFilterMode)

  const editableColumns = useMemo(
    () => columns.filter((c) => !c.isIdentity && c.name !== '_ctid'),
    [columns]
  )

  return {
    connections,
    setConnections,
    connectionName,
    setConnectionName,
    tables,
    setTables,
    activeTable,
    setActiveTable,
    columns,
    setColumns,
    rows,
    setRows,
    totalRows,
    setTotalRows,
    newRowJson,
    setNewRowJson,
    status,
    setStatus,
    page,
    setPage,
    pageSize,
    setPageSize,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    filterColumn,
    setFilterColumn,
    filterValue,
    setFilterValue,
    filterMode,
    setFilterMode,
    editableColumns,
  }
}
