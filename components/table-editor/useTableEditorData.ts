import type { TableFilterMode } from '../../lib/table-filter'
import { useTableEditorEffects } from './useTableEditorEffects'
import { useTableEditorFilterQuery } from './useTableEditorFilterQuery'
import { useTableEditorQueries } from './useTableEditorQueries'
import type { TableEditorFilter } from './stores/tableEditorFilterStore'

type TableEditorState = {
  connectionName: string
  setConnectionName: (value: string) => void
  activeTable: string
  setActiveTable: (value: string) => void
  applyTableNavigation: (args: { activeTable: string; filter?: TableEditorFilter }) => void
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
  filterDebounceMs: number
  setVisibleColumns: (value: string[]) => void
}

export function useTableEditorData(state: TableEditorState) {
  const filterQuery = useTableEditorFilterQuery({
    filterColumn: state.filterColumn,
    filterValue: state.filterValue,
    filterValueEnd: state.filterValueEnd,
    filterMode: state.filterMode,
    filterDebounceMs: state.filterDebounceMs,
  })

  const queries = useTableEditorQueries({
    ...state,
    filterValue: filterQuery.debouncedFilterValue,
    filterValueEnd: filterQuery.debouncedFilterValueEnd,
    rowsQueryEnabled: filterQuery.rowsQueryEnabled,
    hideRowsWhileLoading: filterQuery.hideRowsWhileLoading,
  })

  useTableEditorEffects({
    connectionName: state.connectionName,
    activeTable: state.activeTable,
    applyTableNavigation: state.applyTableNavigation,
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
    debouncedFilterValue: filterQuery.debouncedFilterValue,
    debouncedFilterValueEnd: filterQuery.debouncedFilterValueEnd,
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
