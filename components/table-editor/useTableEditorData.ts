import { useTableEditorEffects } from './useTableEditorEffects'
import { useTableEditorQueries } from './useTableEditorQueries'

type TableEditorState = {
  connectionName: string
  setConnectionName: (value: string) => void
  activeTable: string
  setActiveTable: (value: string) => void
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

export function useTableEditorData(state: TableEditorState) {
  const queries = useTableEditorQueries(state)

  useTableEditorEffects({
    activeTable: state.activeTable,
    setActiveTable: state.setActiveTable,
    pageSize: state.pageSize,
    sortBy: state.sortBy,
    setSortBy: state.setSortBy,
    sortOrder: state.sortOrder,
    filterColumn: state.filterColumn,
    setFilterColumn: state.setFilterColumn,
    filterValue: state.filterValue,
    filterMode: state.filterMode,
    setPage: state.setPage,
    tables: queries.tables,
    loadingTables: queries.loadingTables,
    columns: queries.columns,
  })

  return {
    connections: queries.connections,
    tables: queries.tables,
    columns: queries.columns,
    rows: queries.rows,
    totalRows: queries.totalRows,
    editableColumns: queries.editableColumns,
    loadTables: queries.loadTables,
    loadRows: queries.loadRows,
    updateCell: queries.updateCell,
    deleteRow: queries.deleteRow,
    loadingRows: queries.loadingRows,
    loadingTables: queries.loadingTables,
    connectionReadOnly: queries.connectionReadOnly,
    rowMutationsReadOnly: queries.rowMutationsReadOnly,
    rowMutationsDisabledReason: queries.rowMutationsDisabledReason,
  }
}
