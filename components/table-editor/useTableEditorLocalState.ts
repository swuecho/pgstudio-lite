import { useMemo, useState } from 'react'
import { ColumnInfo, Connection, RowData, TableInfo } from './types'

export function useTableEditorLocalState() {
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
