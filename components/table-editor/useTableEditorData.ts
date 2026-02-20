import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getConnections as getConnectionsService,
  getRows as getRowsService,
  getTables as getTablesService,
  insertRow as insertRowService,
  patchRow,
  removeRow,
} from '../../features/table/table.service'

type TableEditorState = {
  connectionName: string
  setConnectionName: (value: string) => void
  activeTable: string
  setActiveTable: (value: string) => void
  newRowJson: string
  setStatus: (value: string) => void
  page: number
  setPage: (value: number | ((prev: number) => number)) => void
  pageSize: number
  sortBy: string
  setSortBy: (value: string) => void
  sortOrder: 'asc' | 'desc'
  filterColumn: string
  setFilterColumn: (value: string) => void
  filterValue: string
  filterMode: 'contains' | 'equals'
}

export function useTableEditorData(state: TableEditorState) {
  function parseActiveTableKey(activeTableKey: string) {
    const [schema, ...tableParts] = activeTableKey.split('.')
    const table = tableParts.join('.')
    if (!schema || !table) return { schema: 'public', table: activeTableKey }
    return { schema, table }
  }

  function toActiveTableKey(schema: string, table: string) {
    return `${schema}.${table}`
  }

  const selectedTarget = parseActiveTableKey(state.activeTable)
  const queryClient = useQueryClient()
  const connectionsQuery = useQuery({
    queryKey: ['table', 'connections'],
    queryFn: getConnectionsService,
  })
  const connections = connectionsQuery.data?.connections || []

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
  const columns = rowsQuery.data?.columns || []
  const rows = rowsQuery.data?.rows || []
  const totalRows = Number(rowsQuery.data?.total || 0)
  const editableColumns = useMemo(() => columns.filter((c) => !c.isIdentity && c.name !== '_ctid'), [columns])

  function invalidateRows() {
    return queryClient.invalidateQueries({
      queryKey: ['table', 'rows', state.connectionName, state.activeTable],
    })
  }

  const patchRowMutation = useMutation({
    mutationFn: ({ ctid, column, value }: { ctid: string; column: string; value: string }) =>
      patchRow(selectedTarget.table, {
        connectionName: state.connectionName,
        schema: selectedTarget.schema,
        ctid,
        patch: { [column]: value },
      }),
    onSuccess: invalidateRows,
  })

  const deleteRowMutation = useMutation({
    mutationFn: (ctid: string) =>
      removeRow(selectedTarget.table, { connectionName: state.connectionName, schema: selectedTarget.schema, ctid }),
    onSuccess: invalidateRows,
  })

  const insertRowMutation = useMutation({
    mutationFn: (row: Record<string, unknown>) =>
      insertRowService(selectedTarget.table, {
        connectionName: state.connectionName,
        schema: selectedTarget.schema,
        row,
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

  async function updateCell(ctid: string, column: string, value: string) {
    state.setStatus('Saving...')
    try {
      await patchRowMutation.mutateAsync({ ctid, column, value })
      state.setStatus('Saved')
    } catch (error) {
      state.setStatus(error instanceof Error ? error.message : 'Failed to save row')
    }
  }

  async function deleteRow(ctid: string) {
    state.setStatus('Deleting...')
    try {
      await deleteRowMutation.mutateAsync(ctid)
      state.setStatus('Deleted')
    } catch (error) {
      state.setStatus(error instanceof Error ? error.message : 'Failed to delete row')
    }
  }

  async function insertRow() {
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(state.newRowJson)
    } catch {
      state.setStatus('Invalid JSON for new row')
      return
    }

    state.setStatus('Inserting...')
    try {
      await insertRowMutation.mutateAsync(payload)
      state.setStatus('Inserted')
    } catch (error) {
      state.setStatus(error instanceof Error ? error.message : 'Failed to insert row')
    }
  }

  useEffect(() => {
    if (!connectionsQuery.data) return
    if (connectionsQuery.data.connections.length === 0) return
    const currentExists = connectionsQuery.data.connections.some((connection) => connection.name === state.connectionName)
    if (!currentExists) {
      const preferred =
        connectionsQuery.data.connections.find((connection) => connection.isDefault)?.name ||
        connectionsQuery.data.connections[0].name
      state.setConnectionName(preferred)
    }
  }, [connectionsQuery.data, state.connectionName, state.setConnectionName])

  useEffect(() => {
    if (tables.length === 0) {
      if (state.activeTable) state.setActiveTable('')
      return
    }
    if (!tables.some((table) => toActiveTableKey(table.schema, table.table) === state.activeTable)) {
      state.setActiveTable(toActiveTableKey(tables[0].schema, tables[0].table))
    }
  }, [tables, state.activeTable, state.setActiveTable])

  useEffect(() => {
    if (!state.activeTable) return
    state.setPage(0)
  }, [state.activeTable, state.pageSize, state.sortBy, state.sortOrder, state.filterColumn, state.filterMode, state.filterValue])

  useEffect(() => {
    if (columns.length === 0) return
    if (state.sortBy !== '_ctid' && !columns.some((col) => col.name === state.sortBy)) {
      state.setSortBy('_ctid')
    }
    if (state.filterColumn && !columns.some((col) => col.name === state.filterColumn)) {
      state.setFilterColumn('')
    }
  }, [columns, state.filterColumn, state.sortBy, state.setFilterColumn, state.setSortBy])

  return {
    connections,
    tables,
    columns,
    rows,
    totalRows,
    editableColumns,
    loadTables,
    loadRows,
    updateCell,
    deleteRow,
    insertRow,
    loadingRows: rowsQuery.isFetching,
    loadingTables: tablesQuery.isFetching,
  }
}
