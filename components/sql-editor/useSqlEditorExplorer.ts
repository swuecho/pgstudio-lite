import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getSchema, getSchemaColumns } from '../../features/sql/sql.service'
import { useSqlEditorExplorerStore } from './stores/sqlEditorExplorerStore'

export function useSqlEditorExplorer(connectionName: string, historySearch: string) {
  const queryClient = useQueryClient()
  const expandedSchemas = useSqlEditorExplorerStore((s) => s.expandedSchemas)
  const setExpandedSchemas = useSqlEditorExplorerStore((s) => s.setExpandedSchemas)
  const expandedTables = useSqlEditorExplorerStore((s) => s.expandedTables)
  const setExpandedTables = useSqlEditorExplorerStore((s) => s.setExpandedTables)
  const [loadingColumnsByKey, setLoadingColumnsByKey] = useState<Record<string, boolean>>({})

  const schemaQuery = useQuery({
    queryKey: ['sql', 'schema', connectionName],
    queryFn: () => getSchema(connectionName),
    enabled: Boolean(connectionName),
  })
  const schemaTables = useMemo(() => schemaQuery.data?.tables || [], [schemaQuery.data?.tables])

  const schemaTablesRef = useRef<typeof schemaTables>([])
  const tableColumnsByKeyRef = useRef<Record<string, string[]>>({})

  const filteredSchemaTables = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    if (!q) return schemaTables
    return schemaTables.filter((item) => `${item.schema}.${item.table}`.toLowerCase().includes(q))
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
    } finally {
      setLoadingColumnsByKey((prev) => ({ ...prev, [key]: false }))
    }
  }

  function toggleSchema(schema: string) {
    setExpandedSchemas((prev) => ({ ...prev, [schema]: !(prev[schema] ?? true) }))
  }

  function toggleTable(schema: string, table: string) {
    const key = `${schema}.${table}`
    const nextExpanded = !(expandedTables[key] ?? false)
    setExpandedTables((prev) => ({ ...prev, [key]: nextExpanded }))
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
    setExpandedTables({})
  }, [connectionName, setExpandedTables])

  useEffect(() => {
    if (schemaGroups.length === 0) return
    setExpandedSchemas((prev) => {
      const next = { ...prev }
      for (const [schema] of schemaGroups) {
        if (!(schema in next)) next[schema] = true
      }
      return next
    })
  }, [schemaGroups, setExpandedSchemas])

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
    loadingSchema: schemaQuery.isFetching,
  }
}
