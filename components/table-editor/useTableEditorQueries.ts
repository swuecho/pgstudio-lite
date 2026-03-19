import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getRows as getRowsService,
  getTables as getTablesService,
  patchRow,
  removeRow,
} from '../../features/table/table.service'
import { useConnections } from '../shared/hooks/useConnections'
import { parseActiveTableKey } from './tableEditorContracts'
import type { RowKey } from './types'

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
  sortOrder: 'asc' | 'desc'
  filterColumn: string
  filterValue: string
  filterMode: 'contains' | 'equals'
}

export function useTableEditorQueries(state: TableEditorState) {
  const selectedTarget = parseActiveTableKey(state.activeTable)
  const queryClient = useQueryClient()
  const connectionsQuery = useConnections()
  const connections = connectionsQuery.connections

  const tablesQuery = useQuery({
    queryKey: ['table', 'tables', state.connectionName],
    queryFn: () => getTablesService(state.connectionName),
    enabled: Boolean(state.connectionName),
  })
  const tables = tablesQuery.data?.tables || []
  const activeConnection = connections.find((connection) => connection.name === state.connectionName)
  const connectionReadOnly = activeConnection?.readOnly === true

  const rowsQuery = useQuery({
    queryKey: [
      'table',
      'rows',
      state.connectionName,
      state.activeTable,
      state.page,
      state.pageSize,
      state.sortBy,
      state.sortOrder,
      state.filterColumn,
      state.filterMode,
      state.filterValue.trim(),
    ],
    queryFn: () =>
      getRowsService({
        schema: selectedTarget.schema,
        table: selectedTarget.table,
        connectionName: state.connectionName,
        page: state.page,
        pageSize: state.pageSize,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
        filterColumn: state.filterColumn,
        filterValue: state.filterValue,
        filterMode: state.filterMode,
      }),
    enabled: Boolean(state.connectionName && selectedTarget.table),
  })
  const columns = rowsQuery.data?.columns || []
  const rows = rowsQuery.data?.rows || []
  const totalRows = Number(rowsQuery.data?.total || 0)
  const hasPrimaryKey = columns.some((column) => column.isPrimaryKey)
  const rowMutationsReadOnly = connectionReadOnly || !hasPrimaryKey
  const rowMutationsDisabledReason = connectionReadOnly
    ? 'Connection is read-only'
    : hasPrimaryKey
      ? ''
      : 'Table has no primary key; row edits are disabled'
  const editableColumns = useMemo(
    () => columns.filter((c) => !c.isIdentity && !c.isPrimaryKey),
    [columns]
  )

  function invalidateRows() {
    return queryClient.invalidateQueries({
      queryKey: ['table', 'rows', state.connectionName, state.activeTable],
    })
  }

  const patchRowMutation = useMutation({
    mutationFn: ({ rowKey, column, value }: { rowKey: RowKey; column: string; value: unknown }) =>
      patchRow(selectedTarget.table, {
        connectionName: state.connectionName,
        schema: selectedTarget.schema,
        rowKey,
        patch: { [column]: value },
      }),
    onSuccess: invalidateRows,
  })

  const deleteRowMutation = useMutation({
    mutationFn: (rowKey: RowKey) =>
      removeRow(selectedTarget.table, { connectionName: state.connectionName, schema: selectedTarget.schema, rowKey }),
    onSuccess: invalidateRows,
  })

  async function loadTables(conn = state.connectionName) {
    await tablesQuery.refetch()
    await queryClient.invalidateQueries({
      queryKey: ['table', 'tables', conn],
    })
  }

  async function loadRows() {
    await rowsQuery.refetch()
  }

  async function updateCell(rowKey: RowKey | null, column: string, value: unknown) {
    if (rowMutationsReadOnly || !rowKey) {
      state.setStatus(rowMutationsDisabledReason || 'Row edits are disabled')
      return
    }
    state.setStatus('Saving...')
    try {
      await patchRowMutation.mutateAsync({ rowKey, column, value })
      state.setStatus('Saved')
    } catch (error) {
      state.setStatus(error instanceof Error ? error.message : 'Failed to save row')
    }
  }

  async function deleteRow(rowKey: RowKey | null) {
    if (rowMutationsReadOnly || !rowKey) {
      state.setStatus(rowMutationsDisabledReason || 'Row edits are disabled')
      return
    }
    state.setStatus('Deleting...')
    try {
      await deleteRowMutation.mutateAsync(rowKey)
      state.setStatus('Deleted')
    } catch (error) {
      state.setStatus(error instanceof Error ? error.message : 'Failed to delete row')
    }
  }

  return {
    connections,
    connectionsQuery,
    tables,
    tablesQuery,
    columns,
    rows,
    totalRows,
    editableColumns,
    loadTables,
    loadRows,
    updateCell,
    deleteRow,
    loadingRows: rowsQuery.isFetching,
    loadingTables: tablesQuery.isFetching,
    connectionReadOnly,
    rowMutationsReadOnly,
    rowMutationsDisabledReason,
  }
}
