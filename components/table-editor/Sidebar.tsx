import Link from 'next/link'
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
      </aside>

      <aside className="layout-nav">
        <div className="layout-nav-header">
          <div className="nav-title">Table Editor</div>
        </div>

        <div className="layout-nav-controls">
          <input placeholder="Search tables" />
          <button className="btn small" onClick={onRefreshTables}>
            {loadingTables ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="layout-nav-list">
          {tables.length === 0 ? (
            <div className="empty-state">No tables found for this connection.</div>
          ) : (
            tables.map((table) => (
            <button
              key={`${table.schema}.${table.table}`}
              className={`history-item table-nav-item ${activeTable === toActiveTableKey(table.schema, table.table) ? 'active-item' : ''}`}
              onClick={() => onSelectTable(toActiveTableKey(table.schema, table.table))}
            >
              <div className="history-query">{table.schema}.{table.table}</div>
              <div className="history-meta">~{table.estimatedRows} rows</div>
            </button>
            ))
          )}
        </div>
      </aside>
    </>
  )
}
