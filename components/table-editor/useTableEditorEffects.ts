import { useEffect } from 'react'
import {
  defaultFilterModeForColumnKind,
  isFilterModeAllowedForColumnKind,
  type TableFilterMode,
} from '../../lib/table-filter'
import { getColumnKind } from '../../lib/table-column-kind'
import { resolveNextActiveTable, resolveSortAndFilter } from './tableEditorContracts'
import type { ColumnInfo, TableInfo } from './types'

type UseTableEditorEffectsParams = {
  activeTable: string
  setActiveTable: (value: string) => void
  pageSize: number
  sortBy: string
  setSortBy: (value: string) => void
  sortOrder: 'asc' | 'desc'
  filterColumn: string
  setFilterColumn: (value: string) => void
  filterValue: string
  setFilterValue: (value: string) => void
  filterMode: TableFilterMode
  setFilterMode: (value: TableFilterMode) => void
  setPage: (value: number | ((prev: number) => number)) => void
  setVisibleColumns: (value: string[]) => void
  tables: TableInfo[]
  loadingTables: boolean
  columns: ColumnInfo[]
}

export function useTableEditorEffects({
  activeTable,
  setActiveTable,
  pageSize,
  sortBy,
  setSortBy,
  sortOrder,
  filterColumn,
  setFilterColumn,
  filterValue,
  setFilterValue,
  filterMode,
  setFilterMode,
  setPage,
  setVisibleColumns,
  tables,
  loadingTables,
  columns,
}: UseTableEditorEffectsParams) {
  useEffect(() => {
    const nextActiveTable = resolveNextActiveTable(tables, activeTable, loadingTables)
    if (nextActiveTable !== null && nextActiveTable !== activeTable) {
      setActiveTable(nextActiveTable)
    }
  }, [tables, loadingTables, activeTable, setActiveTable])

  useEffect(() => {
    if (!activeTable) return
    setPage(0)
    setSortBy('')
    setFilterColumn('')
    setFilterValue('')
    setVisibleColumns([])
  }, [activeTable, setPage, setSortBy, setFilterColumn, setFilterValue, setVisibleColumns])

  useEffect(() => {
    if (!activeTable) return
    setPage(0)
  }, [pageSize, sortBy, sortOrder, filterColumn, filterMode, filterValue, activeTable, setPage])

  useEffect(() => {
    if (columns.length === 0) return
    const { nextSortBy, nextFilterColumn } = resolveSortAndFilter(columns, sortBy, filterColumn)
    if (nextSortBy !== sortBy) setSortBy(nextSortBy)
    if (nextFilterColumn !== filterColumn) setFilterColumn(nextFilterColumn)
  }, [columns, filterColumn, sortBy, setFilterColumn, setSortBy])

  useEffect(() => {
    if (!filterColumn || columns.length === 0) return
    const columnMeta = columns.find((column) => column.name === filterColumn)
    const kind = getColumnKind(columnMeta?.dataType ?? 'text')
    if (!isFilterModeAllowedForColumnKind(filterMode, kind)) {
      setFilterMode(defaultFilterModeForColumnKind(kind))
    }
  }, [columns, filterColumn, filterMode, setFilterMode])
}
