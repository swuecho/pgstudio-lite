import Link from 'next/link'
import type { RefObject } from 'react'
import ThemeToggle from '../theme-toggle'
import { RelationKindBadge } from '../shared/RelationKindBadge'
import { HistoryItem, SchemaTable, SnippetItem } from './types'
import styles from './Sidebar.module.css'

type SqlSidebarProps = {
  searchInputRef: RefObject<HTMLInputElement | null>
  connectionName: string
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
  loadingHistory: boolean
  loadingSnippets: boolean
  loadingSchema: boolean
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
  onWidthResizerMouseDown?: (event: React.MouseEvent) => void
}

export function SqlSidebar({
  searchInputRef,
  connectionName,
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
  loadingHistory,
  loadingSnippets,
  loadingSchema,
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
  onWidthResizerMouseDown,
}: SqlSidebarProps) {
  const searchPlaceholder =
    activeNavTab === 'history'
      ? 'Search history'
      : activeNavTab === 'snippets'
        ? 'Search snippets'
        : 'Search tables & views'

  return (
    <>
      <aside className={styles.layoutRail}>
        <button className={`${styles.railBtn} ${styles.active}`}>SQL</button>
        <Link className={`${styles.railBtn} ${styles.linkBtn}`} href="/table-editor">
          TB
        </Link>
        <Link className={`${styles.railBtn} ${styles.linkBtn}`} href="/notebook">
          NB
        </Link>
        <Link className={`${styles.railBtn} ${styles.linkBtn}`} href="/activity">
          AC
        </Link>
        <div className="mt-auto flex justify-center">
          <ThemeToggle />
        </div>
      </aside>

      <aside className={styles.layoutNav}>
        <div className={styles.layoutNavHeader}>
          <div className={styles.navTitle}>SQL Editor</div>
          <div className={styles.navTabsInline}>
            <button
              className={`${styles.navTab} ${activeNavTab === 'explorer' ? styles.active : ''}`}
              onClick={() => onChangeNavTab('explorer')}
            >
              Explorer
            </button>
            <button
              className={`${styles.navTab} ${activeNavTab === 'snippets' ? styles.active : ''}`}
              onClick={() => onChangeNavTab('snippets')}
            >
              Snippets{connectionName ? ` · ${connectionName}` : ''}
            </button>
            <button
              className={`${styles.navTab} ${activeNavTab === 'history' ? styles.active : ''}`}
              onClick={() => onChangeNavTab('history')}
            >
              History
            </button>
          </div>
        </div>

        <div className={styles.layoutNavControls}>
          <input
            ref={searchInputRef}
            value={historySearch}
            onChange={(e) => onChangeHistorySearch(e.target.value)}
            placeholder={searchPlaceholder}
          />
          {activeNavTab === 'history' ? (
            <>
              <button className="btn small" onClick={onRefreshHistory} disabled={loadingHistory}>
                {loadingHistory ? 'Refreshing...' : 'Refresh'}
              </button>
              <button
                className="btn small danger"
                onClick={onClearHistory}
                disabled={filteredHistory.length === 0}
              >
                Clear
              </button>
            </>
          ) : activeNavTab === 'snippets' ? (
            <>
              <button className="btn small" onClick={onRefreshSnippets} disabled={loadingSnippets}>
                {loadingSnippets ? 'Refreshing...' : 'Refresh'}
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
              <button className="btn small" onClick={onRefreshSchema} disabled={loadingSchema}>
                {loadingSchema ? 'Refreshing...' : 'Refresh'}
              </button>
              <button className="btn small" onClick={onInsertTemplate}>
                Insert
              </button>
            </>
          )}
        </div>

        <div className={styles.layoutNavList}>
          {activeNavTab === 'history' ? (
            filteredHistory.length === 0 ? (
              <div className="empty-state">
                {loadingHistory
                  ? 'Loading history...'
                  : historySearch.trim()
                    ? 'No history matches your search.'
                    : 'No query history yet. Run a query to start.'}
              </div>
            ) : (
              filteredHistory.map((item) => (
                <div
                  key={item.id}
                  className={styles.historyItem}
                  role="button"
                  tabIndex={0}
                  onClick={() => onLoadHistoryQuery(item.query_text)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') onLoadHistoryQuery(item.query_text)
                  }}
                >
                  <div className={styles.historyTop}>
                    <span className={`pill ${item.status === 'success' ? 'ok' : 'error'}`}>
                      {item.status}
                    </span>
                    <span>{item.duration_ms}ms</span>
                  </div>
                  <div className={styles.historyQuery}>
                    {item.query_text.split('\n').join(' ').slice(0, 140)}
                  </div>
                  <div className="history-meta">{formatTime(item.executed_at)}</div>
                </div>
              ))
            )
          ) : activeNavTab === 'snippets' ? (
            filteredSnippets.length === 0 ? (
              <div className="empty-state">
                {loadingSnippets
                  ? 'Loading snippets...'
                  : historySearch.trim()
                    ? 'No snippets match your search.'
                    : 'No snippets yet. Use Save in the SQL editor to create one.'}
              </div>
            ) : (
              filteredSnippets.map((item) => (
                <div key={item.id} className={`${styles.historyItem} ${styles.snippetItem}`}>
                  <div className={styles.historyTop}>
                    <span className="pill ok">snippet</span>
                    {renamingSnippetId === item.id ? (
                      <input
                        className={styles.snippetTitleInput}
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
                  <div className={`${styles.historyQuery} ${styles.snippetQuery}`}>
                    {item.query_text.split('\n').join(' ').slice(0, 180)}
                  </div>
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
            )
          ) : schemaGroups.length === 0 ? (
            <div className="empty-state">
              {/* Don't claim the connection is empty while the fetch is in flight. */}
              {loadingSchema
                ? 'Loading tables...'
                : historySearch.trim()
                  ? 'No tables or views match your search.'
                  : 'No tables or views found for this connection.'}
            </div>
          ) : (
            schemaGroups.map(([schema, tables]) => (
              <div key={schema} className={styles.explorerGroup}>
                <button
                  className={`${styles.explorerSchema} ${styles.explorerToggleRow}`}
                  onClick={() => onToggleSchema(schema)}
                >
                  <span className={styles.explorerChevron}>
                    {expandedSchemas[schema] === false ? '▸' : '▾'}
                  </span>
                  <span>{schema}</span>
                </button>
                {expandedSchemas[schema] !== false &&
                  tables.map((table) => {
                    const tableKey = `${schema}.${table.table}`
                    const isExpanded = expandedTables[tableKey] === true
                    return (
                      <div key={tableKey} className={styles.explorerItem}>
                        <button
                          className={`${styles.explorerTable} ${styles.explorerToggleRow}`}
                          onClick={() => onToggleTable(schema, table.table)}
                          title={`${isExpanded ? 'Collapse' : 'Expand'} ${schema}.${table.table}`}
                        >
                          <span className={styles.explorerChevron}>{isExpanded ? '▾' : '▸'}</span>
                          <span className={styles.explorerTableName}>
                            <span>{table.table}</span>
                            <RelationKindBadge kind={table.kind} compact />
                          </span>
                        </button>
                        <div className={styles.explorerActions}>
                          <button
                            className={styles.explorerActionBtn}
                            onClick={() => onInsertTableName(schema, table.table)}
                            title={`Insert ${schema}.${table.table}`}
                          >
                            Insert table
                          </button>
                        </div>
                        {isExpanded && (
                          <div className={styles.explorerColumns}>
                            {loadingColumnsByKey[tableKey] ? (
                              <div className="history-meta">Loading columns...</div>
                            ) : (
                              (tableColumnsByKey[tableKey] || []).slice(0, 80).map((column) => (
                                <button
                                  key={`${schema}.${table.table}.${column}`}
                                  className={styles.explorerCol}
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

        {onWidthResizerMouseDown && (
          <div
            className={styles.widthResizer}
            onMouseDown={onWidthResizerMouseDown}
            title="Drag to resize sidebar"
          />
        )}
      </aside>
    </>
  )
}
