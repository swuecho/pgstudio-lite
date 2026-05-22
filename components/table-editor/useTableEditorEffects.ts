import { useEffect, useRef } from 'react'
import {
  defaultFilterModeForColumnKind,
  hasActiveTableFilter,
  isFilterModeAllowedForColumnKind,
  type TableFilterMode,
} from '../../lib/table-filter'
import { buildViewState, viewStateKey } from '../../lib/table-editor-views'
import { getColumnKind } from '../../lib/table-column-kind'
import { resolveNextActiveTable, resolveSortAndFilter } from './tableEditorContracts'
import { restoreTableFilters } from './restoreTableFilters'
import { tableEditorFilterKey, useTableEditorFilterStore } from './stores/tableEditorFilterStore'
import type { TableEditorFilter } from './stores/tableEditorFilterStore'
import type { ColumnInfo, TableInfo } from './types'
import type { TableEditorViewState } from '../../lib/table-editor-views'

const RECENT_VIEW_DEBOUNCE_MS = 400

type UseTableEditorEffectsParams = {
  connectionName: string
  activeTable: string
  applyTableNavigation: (args: { activeTable: string; filter?: TableEditorFilter }) => void
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
  debouncedFilterValue: string
  debouncedFilterValueEnd: string
  setPage: (value: number | ((prev: number) => number)) => void
  tables: TableInfo[]
  loadingTables: boolean
  columns: ColumnInfo[]
  recordRecentView: (view: TableEditorViewState) => void
}

export function useTableEditorEffects({
  connectionName,
  activeTable,
  applyTableNavigation,
  pageSize,
  sortBy,
  setSortBy,
  sortOrder,
  filterColumn,
  setFilterColumn,
  filterValue,
  setFilterValue,
  filterValueEnd,
  setFilterValueEnd,
  filterMode,
  setFilterMode,
  debouncedFilterValue,
  debouncedFilterValueEnd,
  setPage,
  tables,
  loadingTables,
  columns,
  recordRecentView,
}: UseTableEditorEffectsParams) {
  const setFilterForKey = useTableEditorFilterStore((state) => state.setFilterForKey)
  const clearFilterForKey = useTableEditorFilterStore((state) => state.clearFilterForKey)
  const lastRecordedViewKeyRef = useRef('')

  useEffect(() => {
    const nextActiveTable = resolveNextActiveTable(tables, activeTable, loadingTables)
    if (nextActiveTable !== null && nextActiveTable !== activeTable) {
      applyTableNavigation({ activeTable: nextActiveTable })
    }
  }, [tables, loadingTables, activeTable, applyTableNavigation])

  useEffect(() => {
    if (!activeTable) return
    restoreTableFilters(connectionName, activeTable, {
      setFilterColumn,
      setFilterMode,
      setFilterValue,
      setFilterValueEnd,
    })
  }, [
    activeTable,
    connectionName,
    setFilterColumn,
    setFilterValue,
    setFilterValueEnd,
    setFilterMode,
  ])

  useEffect(() => {
    if (!activeTable || !connectionName) return

    const key = tableEditorFilterKey(connectionName, activeTable)
    if (!hasActiveTableFilter(filterColumn, filterMode, filterValue, filterValueEnd)) {
      clearFilterForKey(key)
      return
    }

    setFilterForKey(key, { filterColumn, filterMode, filterValue, filterValueEnd })
  }, [
    activeTable,
    connectionName,
    filterColumn,
    filterMode,
    filterValue,
    filterValueEnd,
    setFilterForKey,
    clearFilterForKey,
  ])

  useEffect(() => {
    if (!activeTable) return
    setPage(0)
  }, [
    pageSize,
    sortBy,
    sortOrder,
    filterColumn,
    filterMode,
    debouncedFilterValue,
    debouncedFilterValueEnd,
    activeTable,
    setPage,
  ])

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

  useEffect(() => {
    lastRecordedViewKeyRef.current = ''
  }, [connectionName])

  useEffect(() => {
    if (!connectionName || !activeTable) return

    const timeoutId = window.setTimeout(() => {
      const view = buildViewState({
        connectionName,
        activeTable,
        filterColumn,
        filterMode,
        filterValue: debouncedFilterValue,
        filterValueEnd: debouncedFilterValueEnd,
      })
      if (!view) return

      const key = viewStateKey(view)
      if (lastRecordedViewKeyRef.current === key) return
      lastRecordedViewKeyRef.current = key
      recordRecentView(view)
    }, RECENT_VIEW_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [
    activeTable,
    connectionName,
    debouncedFilterValue,
    debouncedFilterValueEnd,
    filterColumn,
    filterMode,
    recordRecentView,
  ])
}
