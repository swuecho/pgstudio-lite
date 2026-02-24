import { useActiveConnectionStore } from '../shared/stores/activeConnectionStore'
import { useTableEditorLocalStore } from './stores/tableEditorLocalStore'

export function useTableEditorLocalState() {
  const connectionName = useActiveConnectionStore((s) => s.connectionName)
  const setConnectionName = useActiveConnectionStore((s) => s.setConnectionName)
  const activeTable = useTableEditorLocalStore((s) => s.activeTable)
  const setActiveTable = useTableEditorLocalStore((s) => s.setActiveTable)
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
  const visibleColumns = useTableEditorLocalStore((s) => s.visibleColumns)
  const setVisibleColumns = useTableEditorLocalStore((s) => s.setVisibleColumns)
  const toggleVisibleColumn = useTableEditorLocalStore((s) => s.toggleVisibleColumn)

  return {
    connectionName,
    setConnectionName,
    activeTable,
    setActiveTable,
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
    visibleColumns,
    setVisibleColumns,
    toggleVisibleColumn,
  }
}
