import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createRow,
  getRows as getRowsService,
  getTables as getTablesService,
  patchRow,
  removeRow,
} from '../../features/table/table.service'
import { useActiveConnection } from '../shared/hooks/useActiveConnection'
import { isMutableRelationKind } from '../../lib/relation-kind'
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
  const { connections, connectionReadOnly } = useActiveConnection()

  const tablesQuery = useQuery({
    queryKey: ['table', 'tables', state.connectionName],
    queryFn: () => getTablesService(state.connectionName),
    enabled: Boolean(state.connectionName),
  })
  const tables = tablesQuery.data?.tables || []

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
  const columns = useMemo(() => rowsQuery.data?.columns || [], [rowsQuery.data?.columns])
  const rows = rowsQuery.data?.rows || []
  const totalRows = Number(rowsQuery.data?.total || 0)
  const activeRelation = useMemo(
    () =>
      tables.find(
        (item) => item.schema === selectedTarget.schema && item.table === selectedTarget.table
      ) || null,
    [tables, selectedTarget.schema, selectedTarget.table]
  )
  const hasPrimaryKey = columns.some((column) => column.isPrimaryKey)
  const relationMutable = activeRelation ? isMutableRelationKind(activeRelation.kind) : true
  const rowMutationsReadOnly = connectionReadOnly || !relationMutable || !hasPrimaryKey
  const rowMutationsDisabledReason = connectionReadOnly
    ? 'Connection is read-only'
    : !relationMutable
      ? `${activeRelation?.kind === 'materialized_view' ? 'Materialized view' : 'View'} is read-only`
      : hasPrimaryKey
        ? ''
        : 'Table has no primary key; row edits are disabled'
  const editableColumns = useMemo(
    () => columns.filter((c) => !c.isIdentity && !c.isPrimaryKey),
    [columns]
  )

  useEffect(() => {
    if (!selectedTarget.table) return
    if (rowsQuery.isFetching) {
      state.setStatus('Loading rows...')
      return
    }
    if (rowsQuery.isError) {
      state.setStatus(rowsQuery.error instanceof Error ? rowsQuery.error.message : 'Failed to load rows')
      return
    }
    if (rowsQuery.isSuccess && columns.length > 0) {
      state.setStatus('Ready')
    }
  }, [
    selectedTarget.table,
    rowsQuery.isFetching,
    rowsQuery.isError,
    rowsQuery.isSuccess,
    rowsQuery.error,
    columns.length,
    state.setStatus,
  ])

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

  const insertRowMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      createRow(selectedTarget.table, {
        connectionName: state.connectionName,
        schema: selectedTarget.schema,
        values,
      }),
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

  async function insertRow(values: Record<string, unknown>) {
    if (rowMutationsReadOnly) {
      state.setStatus(rowMutationsDisabledReason || 'Row inserts are disabled')
      return false
    }
    if (Object.keys(values).length === 0) {
      state.setStatus('Provide at least one column value')
      return false
    }
    state.setStatus('Inserting...')
    try {
      await insertRowMutation.mutateAsync(values)
      state.setStatus('Row inserted')
      return true
    } catch (error) {
      state.setStatus(error instanceof Error ? error.message : 'Failed to insert row')
      return false
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
    tables,
    tablesQuery,
    columns,
    rows,
    totalRows,
    editableColumns,
    loadTables,
    loadRows,
    updateCell,
    insertRow,
    deleteRow,
    loadingRows: rowsQuery.isFetching,
    loadingTables: tablesQuery.isFetching,
    connectionReadOnly,
    activeRelation,
    rowMutationsReadOnly,
    rowMutationsDisabledReason,
  }
}
