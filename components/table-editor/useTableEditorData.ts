import type { TableFilterMode } from '../../lib/table-filter'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
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
  setFilterValue: (value: string) => void
  filterValueEnd: string
  setFilterValueEnd: (value: string) => void
  filterMode: TableFilterMode
  setFilterMode: (value: TableFilterMode) => void
  setVisibleColumns: (value: string[]) => void
}

export function useTableEditorData(state: TableEditorState) {
  const debouncedFilterValue = useDebouncedValue(state.filterValue)
  const debouncedFilterValueEnd = useDebouncedValue(state.filterValueEnd)

  const queries = useTableEditorQueries({
    ...state,
    filterValue: debouncedFilterValue,
    filterValueEnd: debouncedFilterValueEnd,
  })

  useTableEditorEffects({
    connectionName: state.connectionName,
    activeTable: state.activeTable,
    setActiveTable: state.setActiveTable,
    pageSize: state.pageSize,
    sortBy: state.sortBy,
    setSortBy: state.setSortBy,
    sortOrder: state.sortOrder,
    filterColumn: state.filterColumn,
    setFilterColumn: state.setFilterColumn,
    filterValue: state.filterValue,
    setFilterValue: state.setFilterValue,
    filterValueEnd: state.filterValueEnd,
    setFilterValueEnd: state.setFilterValueEnd,
    filterMode: state.filterMode,
    setFilterMode: state.setFilterMode,
    debouncedFilterValue,
    debouncedFilterValueEnd,
    setPage: state.setPage,
    setVisibleColumns: state.setVisibleColumns,
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
    insertRow: queries.insertRow,
    deleteRow: queries.deleteRow,
    loadingRows: queries.loadingRows,
    loadingTables: queries.loadingTables,
    connectionReadOnly: queries.connectionReadOnly,
    activeRelation: queries.activeRelation,
    rowMutationsReadOnly: queries.rowMutationsReadOnly,
    rowMutationsDisabledReason: queries.rowMutationsDisabledReason,
  }
}
