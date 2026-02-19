import { useEffect, useMemo, useRef } from 'react'
import { fetchJson } from '../../lib/http'
import { useSqlEditorExplorerStore } from './stores/sqlEditorExplorerStore'

export function useSqlEditorExplorer(connectionName: string, historySearch: string) {
  const schemaTables = useSqlEditorExplorerStore((s) => s.schemaTables)
  const setSchemaTables = useSqlEditorExplorerStore((s) => s.setSchemaTables)
  const tableColumnsByKey = useSqlEditorExplorerStore((s) => s.tableColumnsByKey)
  const setTableColumnsByKey = useSqlEditorExplorerStore((s) => s.setTableColumnsByKey)
  const loadingColumnsByKey = useSqlEditorExplorerStore((s) => s.loadingColumnsByKey)
  const setLoadingColumnsByKey = useSqlEditorExplorerStore((s) => s.setLoadingColumnsByKey)
  const expandedSchemas = useSqlEditorExplorerStore((s) => s.expandedSchemas)
  const setExpandedSchemas = useSqlEditorExplorerStore((s) => s.setExpandedSchemas)
  const expandedTables = useSqlEditorExplorerStore((s) => s.expandedTables)
  const setExpandedTables = useSqlEditorExplorerStore((s) => s.setExpandedTables)

  const schemaTablesRef = useRef<typeof schemaTables>([])
  const tableColumnsByKeyRef = useRef<typeof tableColumnsByKey>({})

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

  async function loadColumnsForTable(schema: string, table: string) {
    const key = `${schema}.${table}`
    if (tableColumnsByKeyRef.current[key]?.length) return
    if (loadingColumnsByKey[key]) return
    setLoadingColumnsByKey((prev) => ({ ...prev, [key]: true }))
    try {
      const data = await fetchJson<{ columns: Array<{ name: string }> }>(
        `/api/schema/columns?connectionName=${encodeURIComponent(connectionName)}&schema=${encodeURIComponent(
          schema
        )}&table=${encodeURIComponent(table)}`
      )
      setTableColumnsByKey((prev) => ({
        ...prev,
        [key]: (data.columns || []).map((c) => c.name),
      }))
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
    const data = await fetchJson<{ tables: typeof schemaTables }>(
      `/api/schema?connectionName=${encodeURIComponent(connectionName)}`
    )
    setSchemaTables(data.tables || [])
  }

  useEffect(() => {
    schemaTablesRef.current = schemaTables
  }, [schemaTables])

  useEffect(() => {
    tableColumnsByKeyRef.current = tableColumnsByKey
  }, [tableColumnsByKey])

  useEffect(() => {
    if (schemaGroups.length === 0) return
    setExpandedSchemas((prev) => {
      const next = { ...prev }
      for (const [schema] of schemaGroups) {
        if (!(schema in next)) next[schema] = true
      }
      return next
    })
  }, [schemaGroups])

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
  }
}
