import type { RefObject } from 'react'
import { formatTableFilterSummary } from '../../lib/table-filter'
import { buildViewState, type TableEditorViewState } from '../../lib/table-editor-views'
import { useTableEditorData } from './useTableEditorData'
import { useTableEditorLocalState } from './useTableEditorLocalState'
import { parseActiveTableKey } from './tableEditorContracts'
import type { RowKey } from './types'

export function useTableEditorState() {
  const state = useTableEditorLocalState()
  const actions = useTableEditorData(state)

  const currentView: TableEditorViewState | null = buildViewState({
    connectionName: state.connectionName,
    activeTable: state.activeTable,
    filterColumn: state.filterColumn,
    filterMode: state.filterMode,
    filterValue: state.filterValue,
    filterValueEnd: state.filterValueEnd,
  })

  function navigateToView(view: TableEditorViewState) {
    if (view.connectionName !== state.connectionName) {
      state.setConnectionName(view.connectionName)
    }
    state.applyTableNavigation({ activeTable: view.activeTable, filter: view.filter })
  }

  function getSidebarProps(args?: {
    activeNavTab?: 'tables' | 'views'
    onChangeNavTab?: (tab: 'tables' | 'views') => void
  }) {
    return {
      connectionName: state.connectionName,
      tables: actions.tables,
      tablesTruncated: actions.tablesTruncated,
      loadingTables: actions.loadingTables,
      activeTable: state.activeTable,
      currentView,
      activeNavTab: args?.activeNavTab,
      onChangeNavTab: args?.onChangeNavTab,
      bookmarks: actions.bookmarks,
      recentViews: actions.recentViews,
      loadingViews: actions.loadingViews,
      onSelectTable: (tableKey: string) => state.applyTableNavigation({ activeTable: tableKey }),
      onNavigateToView: navigateToView,
      onRenameBookmark: actions.renameBookmark,
      onToggleBookmarkPinned: actions.toggleBookmarkPinned,
      onDeleteBookmark: actions.deleteBookmark,
      onClearRecentViews: () => {
        void actions.clearRecentViews()
      },
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
      onImportRows: (columns: string[], rows: unknown[][]) => actions.importRows({ columns, rows }),
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
    currentView,
    navigateToView,
    saveBookmark: actions.saveBookmark,
    getSidebarProps,
    getGridProps,
  }
}
