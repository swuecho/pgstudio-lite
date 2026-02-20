import Link from 'next/link'
import { Connection, TableInfo } from './types'

type TableSidebarProps = {
  connections: Connection[]
  connectionName: string
  onChangeConnection: (name: string) => void
  onOpenConnectionManager: () => void
  tables: TableInfo[]
  activeTable: string
  onSelectTable: (table: string) => void
  onRefreshTables: () => void
}

export function TableSidebar({
  connections,
  connectionName,
  onChangeConnection,
  onOpenConnectionManager,
  tables,
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
          <select value={connectionName} onChange={(e) => onChangeConnection(e.target.value)}>
            {connections.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
                {c.readOnly ? ' (read-only)' : ''}
              </option>
            ))}
          </select>
          <button className="btn small" onClick={onRefreshTables}>
            Refresh
          </button>
          <button className="btn small" onClick={onOpenConnectionManager}>
            Manage
          </button>
        </div>

        <div className="layout-nav-list">
          {tables.map((table) => (
            <button
              key={`${table.schema}.${table.table}`}
              className={`history-item ${activeTable === toActiveTableKey(table.schema, table.table) ? 'active-item' : ''}`}
              onClick={() => onSelectTable(toActiveTableKey(table.schema, table.table))}
            >
              <div className="history-query">{table.schema}.{table.table}</div>
              <div className="history-meta">~{table.estimatedRows} rows</div>
            </button>
          ))}
        </div>
      </aside>
    </>
  )
}
