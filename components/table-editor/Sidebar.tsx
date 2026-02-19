import Link from 'next/link'
import { Connection, TableInfo } from './types'

type TableSidebarProps = {
  connections: Connection[]
  connectionName: string
  onChangeConnection: (name: string) => void
  tables: TableInfo[]
  activeTable: string
  onSelectTable: (table: string) => void
  onRefreshTables: () => void
}

export function TableSidebar({
  connections,
  connectionName,
  onChangeConnection,
  tables,
  activeTable,
  onSelectTable,
  onRefreshTables,
}: TableSidebarProps) {
  return (
    <>
      <aside className="layout-rail">
        <Link className="rail-btn link-btn" href="/">
          SQL
        </Link>
        <button className="rail-btn active">TB</button>
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
              </option>
            ))}
          </select>
          <button className="btn small" onClick={onRefreshTables}>
            Refresh
          </button>
        </div>

        <div className="layout-nav-list">
          {tables.map((table) => (
            <button
              key={`${table.schema}.${table.table}`}
              className={`history-item ${activeTable === table.table ? 'active-item' : ''}`}
              onClick={() => onSelectTable(table.table)}
            >
              <div className="history-query">{table.table}</div>
              <div className="history-meta">~{table.estimatedRows} rows</div>
            </button>
          ))}
        </div>
      </aside>
    </>
  )
}
