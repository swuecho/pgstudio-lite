import type { RefObject } from 'react'
import { formatTableFilterSummary } from '../../lib/table-filter'
import { useTableEditorData } from './useTableEditorData'
import { useTableEditorLocalState } from './useTableEditorLocalState'
import { parseActiveTableKey } from './tableEditorContracts'
import type { RowKey } from './types'

export function useTableEditorState() {
  const state = useTableEditorLocalState()
  const actions = useTableEditorData(state)

  function getSidebarProps() {
    return {
      connectionName: state.connectionName,
      tables: actions.tables,
      tablesTruncated: actions.tablesTruncated,
      loadingTables: actions.loadingTables,
      activeTable: state.activeTable,
      onSelectTable: (tableKey) => state.applyTableNavigation({ activeTable: tableKey }),
      onRefreshTables: () => {
        void actions.loadTables()
      },
    }
  }

  function getGridProps(filterValueInputRef: RefObject<HTMLInputElement | null>) {
    const selectedTarget = parseActiveTableKey(state.activeTable)
    return {
      connectionName: state.connectionName,
      schema: selectedTarget.schema,
      table: selectedTarget.table,
      columns: actions.columns,
      rows: actions.rows,
      editableColumns: actions.editableColumns,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder,
      filterColumn: state.filterColumn,
      filterMode: state.filterMode,
      filterValue: state.filterValue,
      filterValueEnd: state.filterValueEnd,
      filterValueInputRef,
      pageSize: state.pageSize,
      page: state.page,
      totalRows: actions.totalRows,
      readOnlyTable: actions.rowMutationsReadOnly,
      visibleColumns: state.visibleColumns,
      onChangeSortBy: state.setSortBy,
      onChangeSortOrder: state.setSortOrder,
      onChangeFilterColumn: state.setFilterColumn,
      onChangeFilterMode: state.setFilterMode,
      onChangeFilterValue: state.setFilterValue,
      onChangeFilterValueEnd: state.setFilterValueEnd,
      onClearFilters: () => {
        state.setFilterColumn('')
        state.setFilterMode('contains')
        state.setFilterValue('')
        state.setFilterValueEnd('')
        state.setPage(0)
      },
      onChangePageSize: state.setPageSize,
      onUpdateCell: (rowKey: RowKey | null, column: string, value: unknown) => {
        void actions.updateCell(rowKey, column, value)
      },
      onDeleteRow: (rowKey: RowKey | null) => {
        void actions.deleteRow(rowKey)
      },
      onInsertRow: (values: Record<string, unknown>) => actions.insertRow(values),
      onPrevPage: () => state.setPage((p) => Math.max(0, p - 1)),
      onNextPage: () => state.setPage((p) => p + 1),
      onToggleVisibleColumn: state.toggleVisibleColumn,
      onShowAllColumns: () => {
        state.setVisibleColumns(actions.columns.map((c) => c.name))
      },
      onHideAllColumns: () => {
        state.setVisibleColumns([])
      },
    }
  }

  const filterSummary = formatTableFilterSummary(
    state.filterColumn,
    state.filterMode,
    state.filterValue,
    state.filterValueEnd
  )

  return {
    ...state,
    ...actions,
    filterSummary,
    getSidebarProps,
    getGridProps,
  }
}
