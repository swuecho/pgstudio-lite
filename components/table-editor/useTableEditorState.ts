import type { RefObject } from 'react'
import { useTableEditorData } from './useTableEditorData'
import { useTableEditorLocalState } from './useTableEditorLocalState'

export function useTableEditorState() {
  const state = useTableEditorLocalState()
  const actions = useTableEditorData(state)

  function getSidebarProps(onOpenConnectionManager: () => void) {
    return {
      connections: actions.connections,
      connectionName: state.connectionName,
      onChangeConnection: state.setConnectionName,
      onOpenConnectionManager,
      tables: actions.tables,
      loadingTables: actions.loadingTables,
      activeTable: state.activeTable,
      onSelectTable: state.setActiveTable,
      onRefreshTables: () => {
        void actions.loadTables()
      },
    }
  }

  function getGridProps(filterValueInputRef: RefObject<HTMLInputElement | null>) {
    return {
      columns: actions.columns,
      rows: actions.rows,
      editableColumns: actions.editableColumns,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder,
      filterColumn: state.filterColumn,
      filterMode: state.filterMode,
      filterValue: state.filterValue,
      filterValueInputRef,
      pageSize: state.pageSize,
      page: state.page,
      totalRows: actions.totalRows,
      readOnlyConnection: actions.connectionReadOnly,
      onChangeSortBy: state.setSortBy,
      onChangeSortOrder: state.setSortOrder,
      onChangeFilterColumn: state.setFilterColumn,
      onChangeFilterMode: state.setFilterMode,
      onChangeFilterValue: state.setFilterValue,
      onClearFilters: () => {
        state.setFilterColumn('')
        state.setFilterMode('contains')
        state.setFilterValue('')
        state.setPage(0)
      },
      onChangePageSize: state.setPageSize,
      onUpdateCell: (ctid: string, column: string, value: unknown) => {
        void actions.updateCell(ctid, column, value)
      },
      onDeleteRow: (ctid: string) => {
        void actions.deleteRow(ctid)
      },
      onPrevPage: () => state.setPage((p) => Math.max(0, p - 1)),
      onNextPage: () => state.setPage((p) => p + 1),
    }
  }

  return {
    ...state,
    ...actions,
    getSidebarProps,
    getGridProps,
  }
}
