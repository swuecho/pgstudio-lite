import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getSchema, getSchemaColumns } from '@/features/sql/sql.service'
import { useSqlEditorExplorerStore } from './stores/sqlEditorExplorerStore'
import type { SchemaTable } from './types'

const EMPTY_EXPANDED: Record<string, boolean> = {}
const EMPTY_SCHEMA_TABLES: SchemaTable[] = []

export function useSqlEditorExplorer(connectionName: string, historySearch: string) {
  const queryClient = useQueryClient()
  const expandedSchemas = useSqlEditorExplorerStore(
    (s) => s.expandedSchemasByConnection[connectionName] ?? EMPTY_EXPANDED
  )
  const setExpandedSchemasForConnection = useSqlEditorExplorerStore((s) => s.setExpandedSchemasForConnection)
  const expandedTables = useSqlEditorExplorerStore(
    (s) => s.expandedTablesByConnection[connectionName] ?? EMPTY_EXPANDED
  )
  const setExpandedTablesForConnection = useSqlEditorExplorerStore((s) => s.setExpandedTablesForConnection)
  const [loadingColumnsByKey, setLoadingColumnsByKey] = useState<Record<string, boolean>>({})
  const restoredColumnsForRef = useRef('')

  const schemaQuery = useQuery({
    queryKey: ['sql', 'schema', connectionName],
    queryFn: () => getSchema(connectionName),
    enabled: Boolean(connectionName),
  })
  const schemaTables = useMemo(
    () => schemaQuery.data?.tables ?? EMPTY_SCHEMA_TABLES,
    [schemaQuery.data?.tables]
  )

  const schemaTablesRef = useRef<typeof schemaTables>([])
  const tableColumnsByKeyRef = useRef<Record<string, string[]>>({})

  const filteredSchemaTables = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    if (!q) return schemaTables
    return schemaTables.filter((item) => {
      const haystack = `${item.schema}.${item.table} ${item.kind}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [schemaTables, historySearch])

  const schemaGroups = useMemo(() => {
    const grouped = new Map<string, typeof schemaTables>()
    for (const table of filteredSchemaTables) {
      const existing = grouped.get(table.schema) || []
      existing.push(table)
      grouped.set(table.schema, existing)
    }
    return [...grouped.entries()]
  }, [filteredSchemaTables])

  const tableColumnsByKey = useMemo(() => {
    const result: Record<string, string[]> = {}
    for (const [tableKey, isExpanded] of Object.entries(expandedTables)) {
      if (!isExpanded) continue
      const [schema, table] = tableKey.split('.')
      if (!schema || !table) continue
      const cached = queryClient.getQueryData<{ columns: Array<{ name: string }> }>([
        'sql',
        'schema-columns',
        connectionName,
        schema,
        table,
      ])
      if (cached?.columns?.length) result[tableKey] = cached.columns.map((c) => c.name)
    }
    return result
  }, [expandedTables, connectionName, queryClient])

  function readColumnsFromCache(schema: string, table: string): string[] {
    const key = `${schema}.${table}`
    const cached = queryClient.getQueryData<{ columns: Array<{ name: string }> }>([
      'sql',
      'schema-columns',
      connectionName,
      schema,
      table,
    ])
    const columns = cached?.columns?.map((c) => c.name) ?? []
    if (columns.length) {
      tableColumnsByKeyRef.current[key] = columns
    }
    return columns
  }

  async function loadColumnsForTable(schema: string, table: string) {
    const key = `${schema}.${table}`
    if (tableColumnsByKeyRef.current[key]?.length) return
    if (loadingColumnsByKey[key]) return
    setLoadingColumnsByKey((prev) => ({ ...prev, [key]: true }))
    try {
      await queryClient.fetchQuery({
        queryKey: ['sql', 'schema-columns', connectionName, schema, table],
        queryFn: () => getSchemaColumns(connectionName, schema, table),
      })
      readColumnsFromCache(schema, table)
    } finally {
      setLoadingColumnsByKey((prev) => ({ ...prev, [key]: false }))
    }
  }

  async function ensureColumnsForTable(schema: string, table: string): Promise<string[]> {
    const cached = readColumnsFromCache(schema, table)
    if (cached.length) return cached
    await loadColumnsForTable(schema, table)
    return readColumnsFromCache(schema, table)
  }

  function toggleSchema(schema: string) {
    if (!connectionName) return
    setExpandedSchemasForConnection(connectionName, (prev) => ({
      ...prev,
      [schema]: !(prev[schema] ?? true),
    }))
  }

  function toggleTable(schema: string, table: string) {
    if (!connectionName) return
    const key = `${schema}.${table}`
    const nextExpanded = !(expandedTables[key] ?? false)
    setExpandedTablesForConnection(connectionName, (prev) => ({ ...prev, [key]: nextExpanded }))
    if (nextExpanded) void loadColumnsForTable(schema, table)
  }

  async function loadSchema() {
    await schemaQuery.refetch()
  }

  useEffect(() => {
    schemaTablesRef.current = schemaTables
  }, [schemaTables])

  useEffect(() => {
    tableColumnsByKeyRef.current = tableColumnsByKey
  }, [tableColumnsByKey])

  useEffect(() => {
    setLoadingColumnsByKey({})
    restoredColumnsForRef.current = ''
  }, [connectionName])

  useEffect(() => {
    if (!connectionName || schemaGroups.length === 0) return
    setExpandedSchemasForConnection(connectionName, (prev) => {
      let changed = false
      const next = { ...prev }
      for (const [schema] of schemaGroups) {
        if (!(schema in next)) {
          next[schema] = true
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [connectionName, schemaGroups, setExpandedSchemasForConnection])

  const expandedTableKeys = useMemo(
    () =>
      Object.entries(expandedTables)
        .filter(([, isExpanded]) => isExpanded)
        .map(([key]) => key)
        .sort()
        .join('\0'),
    [expandedTables]
  )

  useEffect(() => {
    if (!connectionName || schemaTables.length === 0 || !expandedTableKeys) return
    const restoreKey = `${connectionName}\0${expandedTableKeys}\0${schemaTables.length}`
    if (restoredColumnsForRef.current === restoreKey) return
    restoredColumnsForRef.current = restoreKey

    for (const tableKey of expandedTableKeys.split('\0')) {
      const [schema, table] = tableKey.split('.')
      if (!schema || !table) continue
      const exists = schemaTables.some((item) => item.schema === schema && item.table === table)
      if (exists) void loadColumnsForTable(schema, table)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionName, schemaTables, expandedTableKeys])

  return {
    schemaGroups,
    expandedSchemas,
    expandedTables,
    loadingColumnsByKey,
    tableColumnsByKey,
    schemaTablesRef,
    tableColumnsByKeyRef,
    toggleSchema,
    toggleTable,
    loadSchema,
    ensureColumnsForTable,
    loadingSchema: schemaQuery.isFetching,
  }
}
