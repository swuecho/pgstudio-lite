import { useMemo, useState } from 'react'
import Link from 'next/link'
import ThemeToggle from '../theme-toggle'
import { RelationKindBadge } from '../shared/RelationKindBadge'
import { useTableEditorSchemaStore } from './stores/tableEditorSchemaStore'
import { TableInfo } from './types'
import styles from './TableEditorStyles.module.css'

type TableSidebarProps = {
  connectionName: string
  tables: TableInfo[]
  loadingTables: boolean
  activeTable: string
  onSelectTable: (table: string) => void
  onRefreshTables: () => void
  onWidthResizerMouseDown?: (event: React.MouseEvent) => void
}

export function TableSidebar({
  connectionName,
  tables,
  loadingTables,
  activeTable,
  onSelectTable,
  onRefreshTables,
  onWidthResizerMouseDown,
}: TableSidebarProps) {
  const toActiveTableKey = (schema: string, table: string) => `${schema}.${table}`
  const persistedSchema = useTableEditorSchemaStore(
    (state) => state.selectedSchemaByConnection[connectionName] ?? ''
  )
  const setPersistedSchema = useTableEditorSchemaStore((state) => state.setSelectedSchemaForConnection)
  const [tableSearch, setTableSearch] = useState('')

  const availableSchemas = useMemo(
    () => Array.from(new Set(tables.map((table) => table.schema))).sort((a, b) => a.localeCompare(b)),
    [tables],
  )

  const selectedSchema = useMemo(() => {
    if (availableSchemas.length === 0) return ''

    if (persistedSchema && availableSchemas.includes(persistedSchema)) return persistedSchema

    const activeSchema = activeTable.split('.')[0] || ''
    if (activeSchema && availableSchemas.includes(activeSchema)) return activeSchema

    return availableSchemas[0]
  }, [activeTable, availableSchemas, persistedSchema])

  const visibleTables = useMemo(() => {
    const query = tableSearch.trim().toLowerCase()

    return tables.filter((table) => {
      if (selectedSchema && table.schema !== selectedSchema) return false
      if (!query) return true

      const fullName = `${table.schema}.${table.table} ${table.kind}`.toLowerCase()
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
            onChange={(event) => setPersistedSchema(connectionName, event.target.value)}
            disabled={availableSchemas.length === 0}
          >
            {availableSchemas.map((schema) => (
              <option key={schema} value={schema}>
                {schema}
              </option>
            ))}
          </select>
          <input
            placeholder="Search tables & views"
            value={tableSearch}
            onChange={(event) => setTableSearch(event.target.value)}
            aria-label="Search tables and views"
          />
          <button className="btn small" onClick={onRefreshTables}>
            {loadingTables ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className={`layout-nav-list ${styles.tableCardsList}`}>
          {visibleTables.length === 0 ? (
            <div className="empty-state">
              {tables.length === 0
                ? 'No tables or views found for this connection.'
                : tableSearch.trim()
                  ? 'No tables or views match your search in this schema.'
                  : 'No tables or views found in this schema.'}
            </div>
          ) : (
            visibleTables.map((table) => (
              <button
                key={`${table.schema}.${table.table}`}
                className={`${styles.tableCard} ${activeTable === toActiveTableKey(table.schema, table.table) ? styles.tableCardActive : ''}`}
                onClick={() => onSelectTable(toActiveTableKey(table.schema, table.table))}
              >
                <div className={styles.tableCardHeader}>
                  <div className={styles.tableCardNameRow}>
                    <div className={styles.tableCardName}>{table.table}</div>
                    <RelationKindBadge kind={table.kind} compact />
                  </div>
                  <div className={styles.tableCardRows}>~{table.estimatedRows} rows</div>
                </div>
              </button>
            ))
          )}
        </div>

        {onWidthResizerMouseDown && (
          <div className="width-resizer" onMouseDown={onWidthResizerMouseDown} title="Drag to resize sidebar" />
        )}
      </aside>
    </>
  )
}
