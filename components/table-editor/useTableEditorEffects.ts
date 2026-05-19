import { useEffect } from 'react'
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
  filterMode: 'contains' | 'equals'
  setPage: (value: number | ((prev: number) => number)) => void
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
  filterMode,
  setPage,
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
  }, [activeTable, pageSize, sortBy, sortOrder, filterColumn, filterMode, filterValue, setPage])

  useEffect(() => {
    if (columns.length === 0) return
    const { nextSortBy, nextFilterColumn } = resolveSortAndFilter(columns, sortBy, filterColumn)
    if (nextSortBy !== sortBy) setSortBy(nextSortBy)
    if (nextFilterColumn !== filterColumn) setFilterColumn(nextFilterColumn)
  }, [columns, filterColumn, sortBy, setFilterColumn, setSortBy])
}
