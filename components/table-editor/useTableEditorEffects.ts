import { useEffect } from 'react'
import { resolveNextActiveTable, resolveSortAndFilter } from './tableEditorContracts'
import type { ColumnInfo, Connection, TableInfo } from './types'

type TableEditorState = {
  connectionName: string
  setConnectionName: (value: string) => void
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
}

type UseTableEditorEffectsParams = {
  state: TableEditorState
  configuredConnections?: Connection[]
  tables: TableInfo[]
  loadingTables: boolean
  columns: ColumnInfo[]
}

export function useTableEditorEffects({
  state,
  configuredConnections,
  tables,
  loadingTables,
  columns,
}: UseTableEditorEffectsParams) {
  useEffect(() => {
    if (!configuredConnections || configuredConnections.length === 0) return
    const currentExists = configuredConnections.some((connection) => connection.name === state.connectionName)
    if (!currentExists) {
      const preferred =
        configuredConnections.find((connection) => connection.isDefault)?.name || configuredConnections[0].name
      state.setConnectionName(preferred)
    }
  }, [configuredConnections, state.connectionName, state.setConnectionName])

  useEffect(() => {
    const nextActiveTable = resolveNextActiveTable(tables, state.activeTable, loadingTables)
    if (nextActiveTable !== null && nextActiveTable !== state.activeTable) {
      state.setActiveTable(nextActiveTable)
    }
  }, [tables, loadingTables, state.activeTable, state.setActiveTable])

  useEffect(() => {
    if (!state.activeTable) return
    state.setPage(0)
  }, [state.activeTable, state.pageSize, state.sortBy, state.sortOrder, state.filterColumn, state.filterMode, state.filterValue, state.setPage])

  useEffect(() => {
    if (columns.length === 0) return
    const { nextSortBy, nextFilterColumn } = resolveSortAndFilter(columns, state.sortBy, state.filterColumn)
    if (nextSortBy !== state.sortBy) state.setSortBy(nextSortBy)
    if (nextFilterColumn !== state.filterColumn) state.setFilterColumn(nextFilterColumn)
  }, [columns, state.filterColumn, state.sortBy, state.setFilterColumn, state.setSortBy])
}
