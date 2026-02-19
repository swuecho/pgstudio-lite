import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchJson } from '../../lib/http'
import { SchemaTable } from './types'

export function useSqlEditorExplorer(connectionName: string, historySearch: string) {
  const [schemaTables, setSchemaTables] = useState<SchemaTable[]>([])
  const [tableColumnsByKey, setTableColumnsByKey] = useState<Record<string, string[]>>({})
  const [loadingColumnsByKey, setLoadingColumnsByKey] = useState<Record<string, boolean>>({})
  const [expandedSchemas, setExpandedSchemas] = useState<Record<string, boolean>>({})
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({})

  const schemaTablesRef = useRef<SchemaTable[]>([])
  const tableColumnsByKeyRef = useRef<Record<string, string[]>>({})

  const filteredSchemaTables = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    if (!q) return schemaTables
    return schemaTables.filter((item) => `${item.schema}.${item.table}`.toLowerCase().includes(q))
  }, [schemaTables, historySearch])

  const schemaGroups = useMemo(() => {
    const grouped = new Map<string, SchemaTable[]>()
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
    const data = await fetchJson<{ tables: SchemaTable[] }>(
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
