import Link from 'next/link'
import { HistoryItem, SchemaTable, SnippetItem } from './types'

type SqlSidebarProps = {
  activeNavTab: 'history' | 'snippets' | 'explorer'
  onChangeNavTab: (tab: 'history' | 'snippets' | 'explorer') => void
  historySearch: string
  onChangeHistorySearch: (value: string) => void
  onRefreshHistory: () => void
  onClearHistory: () => void
  onRefreshSnippets: () => void
  onSaveSnippet: (forceCreate?: boolean) => void
  onRefreshSchema: () => void
  onInsertTemplate: () => void
  canSaveAs: boolean
  savingSnippet: boolean
  filteredHistory: HistoryItem[]
  filteredSnippets: SnippetItem[]
  schemaGroups: Array<[string, SchemaTable[]]>
  expandedSchemas: Record<string, boolean>
  onToggleSchema: (schema: string) => void
  expandedTables: Record<string, boolean>
  onToggleTable: (schema: string, table: string) => void
  loadingColumnsByKey: Record<string, boolean>
  tableColumnsByKey: Record<string, string[]>
  onLoadHistoryQuery: (queryText: string) => void
  onLoadSnippetQuery: (queryText: string) => void
  onEditSnippet: (item: SnippetItem) => void
  onDuplicateSnippet: (item: SnippetItem) => void
  onRenameSnippet: (item: SnippetItem, nextTitle?: string) => void
  onDeleteSnippet: (item: SnippetItem) => void
  renamingSnippetId: string | null
  renameDraft: string
  onChangeRenameDraft: (value: string) => void
  onBeginRenameSnippet: (item: SnippetItem) => void
  onCancelRenameSnippet: () => void
  onInsertTableName: (schema: string, table: string) => void
  onInsertColumnName: (column: string) => void
  formatTime: (iso: string) => string
}

export function SqlSidebar({
  activeNavTab,
  onChangeNavTab,
  historySearch,
  onChangeHistorySearch,
  onRefreshHistory,
  onClearHistory,
  onRefreshSnippets,
  onSaveSnippet,
  onRefreshSchema,
  onInsertTemplate,
  canSaveAs,
  savingSnippet,
  filteredHistory,
  filteredSnippets,
  schemaGroups,
  expandedSchemas,
  onToggleSchema,
  expandedTables,
  onToggleTable,
  loadingColumnsByKey,
  tableColumnsByKey,
  onLoadHistoryQuery,
  onLoadSnippetQuery,
  onEditSnippet,
  onDuplicateSnippet,
  onRenameSnippet,
  onDeleteSnippet,
  renamingSnippetId,
  renameDraft,
  onChangeRenameDraft,
  onBeginRenameSnippet,
  onCancelRenameSnippet,
  onInsertTableName,
  onInsertColumnName,
  formatTime,
}: SqlSidebarProps) {
  return (
    <>
      <aside className="layout-rail">
        <button className="rail-btn active">SQL</button>
        <Link className="rail-btn link-btn" href="/table-editor">
          TB
        </Link>
        <Link className="rail-btn link-btn" href="/notebook">
          NB
        </Link>
      </aside>

      <aside className="layout-nav">
        <div className="layout-nav-header">
          <div className="nav-title">SQL Editor</div>
        </div>

        <div className="layout-nav-tabs">
          <button
            className={`nav-tab ${activeNavTab === 'explorer' ? 'active' : ''}`}
            onClick={() => onChangeNavTab('explorer')}
          >
            Explorer
          </button>
          <button
            className={`nav-tab ${activeNavTab === 'snippets' ? 'active' : ''}`}
            onClick={() => onChangeNavTab('snippets')}
          >
            Snippets
          </button>
          <button
            className={`nav-tab ${activeNavTab === 'history' ? 'active' : ''}`}
            onClick={() => onChangeNavTab('history')}
          >
            History
          </button>
        </div>

        <div className="layout-nav-controls">
          <input value={historySearch} onChange={(e) => onChangeHistorySearch(e.target.value)} placeholder="Search" />
          {activeNavTab === 'history' ? (
            <>
              <button className="btn small" onClick={onRefreshHistory}>
                Refresh
              </button>
              <button className="btn small danger" onClick={onClearHistory}>
                Clear
              </button>
            </>
          ) : activeNavTab === 'snippets' ? (
            <>
              <button className="btn small" onClick={onRefreshSnippets}>
                Refresh
              </button>
              <button className="btn small" onClick={() => onSaveSnippet(false)}>
                {canSaveAs ? 'Update' : 'Save'}
              </button>
              {canSaveAs && (
                <button className="btn small" onClick={() => onSaveSnippet(true)}>
                  Save As
                </button>
              )}
              {savingSnippet && <span className="history-meta">Autosaving...</span>}
            </>
          ) : (
            <>
              <button className="btn small" onClick={onRefreshSchema}>
                Refresh
              </button>
              <button className="btn small" onClick={onInsertTemplate}>
                Insert
              </button>
            </>
          )}
        </div>

        <div className="layout-nav-list">
          {activeNavTab === 'history' ? (
            filteredHistory.map((item) => (
              <div
                key={item.id}
                className="history-item"
                role="button"
                tabIndex={0}
                onClick={() => onLoadHistoryQuery(item.query_text)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onLoadHistoryQuery(item.query_text)
                }}
              >
                <div className="history-top">
                  <span className={`pill ${item.status === 'success' ? 'ok' : 'error'}`}>{item.status}</span>
                  <span>{item.duration_ms}ms</span>
                </div>
                <div className="history-query">{item.query_text.split('\n').join(' ').slice(0, 140)}</div>
                <div className="history-meta">{formatTime(item.executed_at)}</div>
              </div>
            ))
          ) : activeNavTab === 'snippets' ? (
            filteredSnippets.map((item) => (
              <div key={item.id} className="history-item snippet-item">
                <div className="history-top">
                  <span className="pill ok">snippet</span>
                  {renamingSnippetId === item.id ? (
                    <input
                      className="snippet-title-input"
                      value={renameDraft}
                      autoFocus
                      onChange={(event) => onChangeRenameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void onRenameSnippet(item, renameDraft)
                        }
                        if (event.key === 'Escape') onCancelRenameSnippet()
                      }}
                      onBlur={() => {
                        void onRenameSnippet(item, renameDraft)
                      }}
                    />
                  ) : (
                    <span>{item.title}</span>
                  )}
                </div>
                <div className="history-query snippet-query">{item.query_text.split('\n').join(' ').slice(0, 180)}</div>
                <div className="history-meta">
                  <span>{formatTime(item.updated_at)}</span>
                </div>
                <div className="history-actions">
                  <button className="btn small" onClick={() => onLoadSnippetQuery(item.query_text)}>
                    Load
                  </button>
                  <button className="btn small" onClick={() => onEditSnippet(item)}>
                    Edit
                  </button>
                  <button className="btn small" onClick={() => onDuplicateSnippet(item)}>
                    Duplicate
                  </button>
                  {renamingSnippetId === item.id ? (
                    <button className="btn small" onClick={() => onRenameSnippet(item, renameDraft)}>
                      Apply
                    </button>
                  ) : (
                    <button className="btn small" onClick={() => onBeginRenameSnippet(item)}>
                      Rename
                    </button>
                  )}
                  <button className="btn small danger" onClick={() => onDeleteSnippet(item)}>
                    Delete
                  </button>
                </div>
              </div>
            ))
          ) : (
            schemaGroups.map(([schema, tables]) => (
              <div key={schema} className="explorer-group">
                <button className="explorer-schema explorer-toggle-row" onClick={() => onToggleSchema(schema)}>
                  <span className="explorer-chevron">{expandedSchemas[schema] === false ? '▸' : '▾'}</span>
                  <span>{schema}</span>
                </button>
                {expandedSchemas[schema] !== false &&
                  tables.map((table) => {
                    const tableKey = `${schema}.${table.table}`
                    const isExpanded = expandedTables[tableKey] === true
                    return (
                      <div key={tableKey} className="explorer-item">
                        <button
                          className="explorer-table explorer-toggle-row"
                          onClick={() => onToggleTable(schema, table.table)}
                          title={`${isExpanded ? 'Collapse' : 'Expand'} ${schema}.${table.table}`}
                        >
                          <span className="explorer-chevron">{isExpanded ? '▾' : '▸'}</span>
                          <span>{table.table}</span>
                        </button>
                        <div className="explorer-actions">
                          <button
                            className="explorer-action-btn"
                            onClick={() => onInsertTableName(schema, table.table)}
                            title={`Insert ${schema}.${table.table}`}
                          >
                            Insert table
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="explorer-columns">
                            {loadingColumnsByKey[tableKey] ? (
                              <div className="history-meta">Loading columns...</div>
                            ) : (
                              (tableColumnsByKey[tableKey] || []).slice(0, 80).map((column) => (
                                <button
                                  key={`${schema}.${table.table}.${column}`}
                                  className="explorer-col"
                                  onClick={() => onInsertColumnName(column)}
                                  title={`Insert ${column}`}
                                >
                                  {column}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  )
}
