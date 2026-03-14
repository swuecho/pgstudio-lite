import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import ThemeToggle from '../theme-toggle'
import { TableInfo } from './types'

type TableSidebarProps = {
  tables: TableInfo[]
  loadingTables: boolean
  activeTable: string
  onSelectTable: (table: string) => void
  onRefreshTables: () => void
}

export function TableSidebar({
  tables,
  loadingTables,
  activeTable,
  onSelectTable,
  onRefreshTables,
}: TableSidebarProps) {
  const toActiveTableKey = (schema: string, table: string) => `${schema}.${table}`
  const [selectedSchema, setSelectedSchema] = useState('')
  const [tableSearch, setTableSearch] = useState('')

  const availableSchemas = useMemo(
    () => Array.from(new Set(tables.map((table) => table.schema))).sort((a, b) => a.localeCompare(b)),
    [tables],
  )

  useEffect(() => {
    if (availableSchemas.length === 0) {
      setSelectedSchema('')
      return
    }

    const activeSchema = activeTable.split('.')[0] || ''

    setSelectedSchema((prev) => {
      if (prev && availableSchemas.includes(prev)) return prev
      if (activeSchema && availableSchemas.includes(activeSchema)) return activeSchema
      return availableSchemas[0]
    })
  }, [activeTable, availableSchemas])

  const visibleTables = useMemo(() => {
    const query = tableSearch.trim().toLowerCase()

    return tables.filter((table) => {
      if (selectedSchema && table.schema !== selectedSchema) return false
      if (!query) return true

      const fullName = `${table.schema}.${table.table}`.toLowerCase()
      return fullName.includes(query) || table.table.toLowerCase().includes(query)
    })
  }, [selectedSchema, tableSearch, tables])

  return (
    <>
      <aside className="layout-rail">
        <Link className="rail-btn link-btn" href="/">
          SQL
        </Link>
        <button className="rail-btn active">TB</button>
        <Link className="rail-btn link-btn" href="/notebook">
          NB
        </Link>
        <div className="mt-auto flex justify-center">
          <ThemeToggle />
        </div>
      </aside>

      <aside className="layout-nav">
        <div className="layout-nav-header">
          <div className="nav-title">Table Editor</div>
        </div>

        <div className="layout-nav-controls">
          <select
            aria-label="Schema"
            value={selectedSchema}
            onChange={(event) => setSelectedSchema(event.target.value)}
            disabled={availableSchemas.length === 0}
          >
            {availableSchemas.map((schema) => (
              <option key={schema} value={schema}>
                {schema}
              </option>
            ))}
          </select>
          <input
            placeholder="Search tables"
            value={tableSearch}
            onChange={(event) => setTableSearch(event.target.value)}
            aria-label="Search tables"
          />
          <button className="btn small" onClick={onRefreshTables}>
            {loadingTables ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="layout-nav-list">
          {visibleTables.length === 0 ? (
            <div className="empty-state">
              {tables.length === 0
                ? 'No tables found for this connection.'
                : tableSearch.trim()
                  ? 'No tables match your search in this schema.'
                  : 'No tables found in this schema.'}
            </div>
          ) : (
            visibleTables.map((table) => (
              <button
                key={`${table.schema}.${table.table}`}
                className={`history-item table-nav-item ${activeTable === toActiveTableKey(table.schema, table.table) ? 'active-item' : ''}`}
                onClick={() => onSelectTable(toActiveTableKey(table.schema, table.table))}
              >
                <div className="history-query">
                  {table.schema}.{table.table}
                </div>
                <div className="history-meta">~{table.estimatedRows} rows</div>
              </button>
            ))
          )}
        </div>
      </aside>
    </>
  )
}
