import { NavRail } from '@/components/shared/NavRail'
import { useMemo, useState } from 'react'
import type { RefObject } from 'react'
import { toTableKey, type TableListSortMode } from '@/lib/table-editor-nav'
import {
  filterViews,
  partitionViewBookmarks,
  type TableEditorBookmark,
  type TableEditorRecentView,
  type TableEditorViewState,
} from '@/lib/table-editor-views'
import { EMPTY_TABLE_KEYS, useTableEditorNavStore } from './stores/tableEditorNavStore'
import { useTableEditorSchemaStore } from './stores/tableEditorSchemaStore'
import { SidebarTableCard } from './SidebarTableCard'
import { SidebarViewsList } from './SidebarViewsList'
import { TableInfo } from './types'
import { useTableListFocus } from './useTableListFocus'
import { tableItemKey, useTableSidebarSections } from './useTableSidebarSections'
import styles from './TableEditorStyles.module.css'

type TableSidebarNavTab = 'tables' | 'views'

type TableSidebarProps = {
  /** Focus target for the `/` search shortcut. */
  searchInputRef?: RefObject<HTMLInputElement | null>
  connectionName: string
  tables: TableInfo[]
  tablesTruncated: boolean
  loadingTables: boolean
  activeTable: string
  currentView: TableEditorViewState | null
  bookmarks: TableEditorBookmark[]
  recentViews: TableEditorRecentView[]
  loadingViews: boolean
  activeNavTab?: TableSidebarNavTab
  onChangeNavTab?: (tab: TableSidebarNavTab) => void
  onSelectTable: (table: string) => void
  onNavigateToView: (view: TableEditorViewState) => void
  onRenameBookmark: (id: string, title: string) => void | Promise<void>
  onToggleBookmarkPinned: (id: string) => void | Promise<void>
  onDeleteBookmark: (id: string) => void | Promise<void>
  onClearRecentViews: () => void
  onRefreshTables: () => void
  onWidthResizerMouseDown?: (event: React.MouseEvent) => void
}

/**
 * Table editor sidebar with two tabs: the schema-filtered, searchable table
 * list (pinned / recent / all, keyboard navigable) and saved / recent views.
 */
export function TableSidebar({
  searchInputRef,
  connectionName,
  tables,
  tablesTruncated,
  loadingTables,
  activeTable,
  currentView,
  bookmarks,
  recentViews,
  loadingViews,
  activeNavTab: activeNavTabProp,
  onChangeNavTab,
  onSelectTable,
  onNavigateToView,
  onRenameBookmark,
  onToggleBookmarkPinned,
  onDeleteBookmark,
  onClearRecentViews,
  onRefreshTables,
  onWidthResizerMouseDown,
}: TableSidebarProps) {
  const persistedSchema = useTableEditorSchemaStore(
    (state) => state.selectedSchemaByConnection[connectionName] ?? ''
  )
  const setPersistedSchema = useTableEditorSchemaStore((state) => state.setSelectedSchemaForConnection)
  const pinnedKeys = useTableEditorNavStore(
    (state) => state.pinnedByConnection[connectionName] ?? EMPTY_TABLE_KEYS
  )
  const recentKeys = useTableEditorNavStore(
    (state) => state.recentByConnection[connectionName] ?? EMPTY_TABLE_KEYS
  )
  const togglePinned = useTableEditorNavStore((state) => state.togglePinned)
  const recordRecent = useTableEditorNavStore((state) => state.recordRecent)

  const [internalNavTab, setInternalNavTab] = useState<TableSidebarNavTab>('tables')
  const activeNavTab = activeNavTabProp ?? internalNavTab
  const setActiveNavTab = onChangeNavTab ?? setInternalNavTab

  const [tableSearch, setTableSearch] = useState('')
  const [viewsSearch, setViewsSearch] = useState('')
  const [sortMode, setSortMode] = useState<TableListSortMode>('name')

  const {
    parsedSearch,
    searchAllSchemas,
    availableSchemas,
    selectedSchema,
    listSections,
    flatTables,
    visibleTableItemKeys,
  } = useTableSidebarSections({
    tables,
    activeTable,
    persistedSchema,
    tableSearch,
    sortMode,
    pinnedKeys,
    recentKeys,
  })
  const matchCount = flatTables.length

  const { setFocusedKey, activeTableItemKey, itemRefs, handleSelectTable, handleListKeyDown } =
    useTableListFocus({
      connectionName,
      activeTable,
      flatTables,
      visibleTableItemKeys,
      onSelectTable,
      recordRecent,
    })

  const { pinned: pinnedBookmarks, unpinned: unpinnedBookmarks } = useMemo(
    () => partitionViewBookmarks(bookmarks),
    [bookmarks]
  )
  const filteredPinnedBookmarks = useMemo(
    () => filterViews(pinnedBookmarks, viewsSearch, (item) => item.title),
    [pinnedBookmarks, viewsSearch]
  )
  const filteredBookmarks = useMemo(
    () => filterViews(unpinnedBookmarks, viewsSearch, (item) => item.title),
    [unpinnedBookmarks, viewsSearch]
  )
  const filteredRecentViews = useMemo(() => filterViews(recentViews, viewsSearch), [recentViews, viewsSearch])
  const viewsMatchCount =
    filteredPinnedBookmarks.length + filteredBookmarks.length + filteredRecentViews.length

  return (
    <>
      <NavRail active="table" />

      <aside className="layout-nav">
        <div className="layout-nav-header">
          <div className="nav-title">Table Editor</div>
          <div className="nav-tabs-inline">
            <button
              className={`nav-tab ${activeNavTab === 'tables' ? 'active' : ''}`}
              onClick={() => setActiveNavTab('tables')}
            >
              Tables
            </button>
            <button
              className={`nav-tab ${activeNavTab === 'views' ? 'active' : ''}`}
              onClick={() => setActiveNavTab('views')}
            >
              Views{connectionName ? ` · ${connectionName}` : ''}
            </button>
          </div>
        </div>

        {activeNavTab === 'tables' ? (
          <div className={`layout-nav-controls ${styles.tableNavControls}`}>
            <select
              aria-label="Schema"
              value={selectedSchema}
              onChange={(event) => setPersistedSchema(connectionName, event.target.value)}
              disabled={availableSchemas.length === 0 || searchAllSchemas}
              title={searchAllSchemas ? 'Schema filter disabled while searching all schemas' : undefined}
            >
              {availableSchemas.map((schema) => (
                <option key={schema} value={schema}>
                  {schema}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort tables"
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as TableListSortMode)}
            >
              <option value="name">Sort: name</option>
              <option value="kind">Sort: type</option>
              <option value="size">Sort: size</option>
            </select>
            <div className={styles.tableSearchWrap}>
              <input
                ref={searchInputRef}
                placeholder="Search (table:, view:, mv:)  (/)"
                value={tableSearch}
                onChange={(event) => setTableSearch(event.target.value)}
                aria-label="Search tables and views"
              />
              {tableSearch ? (
                <button
                  type="button"
                  className={styles.tableSearchClear}
                  aria-label="Clear search"
                  onClick={() => setTableSearch('')}
                >
                  ×
                </button>
              ) : null}
            </div>
            <button className="btn small" onClick={onRefreshTables} disabled={loadingTables}>
              {loadingTables ? 'Refreshing...' : 'Refresh'}
            </button>
            <div className={styles.tableNavMeta} aria-live="polite">
              {loadingTables && tables.length === 0 ? (
                'Loading...'
              ) : (
                <>
                  {matchCount} {matchCount === 1 ? 'table' : 'tables'}
                  {searchAllSchemas ? ' · all schemas' : ''}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className={`layout-nav-controls ${styles.viewsNavControls}`}>
            <input
              placeholder="Search views"
              value={viewsSearch}
              onChange={(event) => setViewsSearch(event.target.value)}
              aria-label="Search saved and recent views"
            />
            <button
              className="btn small danger"
              onClick={onClearRecentViews}
              disabled={recentViews.length === 0 || loadingViews}
            >
              Clear recent
            </button>
            <div className={styles.tableNavMeta} aria-live="polite">
              {viewsMatchCount} {viewsMatchCount === 1 ? 'view' : 'views'}
            </div>
          </div>
        )}

        {activeNavTab === 'tables' && tablesTruncated ? (
          <div className={styles.tableListNotice} role="status">
            Showing first 500 tables. Narrow your schema or search to find others.
          </div>
        ) : null}

        <div
          className={`layout-nav-list ${
            activeNavTab === 'tables'
              ? `${styles.tableCardsList} ${loadingTables ? styles.tableCardsListLoading : ''}`
              : styles.viewsList
          }`}
          role={activeNavTab === 'tables' ? 'listbox' : undefined}
          aria-label={activeNavTab === 'tables' ? 'Tables and views' : 'Saved and recent views'}
          aria-busy={activeNavTab === 'tables' ? loadingTables : undefined}
          tabIndex={activeNavTab === 'tables' ? 0 : undefined}
          onKeyDown={activeNavTab === 'tables' ? handleListKeyDown : undefined}
        >
          {activeNavTab === 'views' ? (
            <SidebarViewsList
              currentView={currentView}
              viewsSearch={viewsSearch}
              pinnedBookmarks={filteredPinnedBookmarks}
              bookmarks={filteredBookmarks}
              recentViews={filteredRecentViews}
              onNavigateToView={onNavigateToView}
              onRenameBookmark={onRenameBookmark}
              onToggleBookmarkPinned={onToggleBookmarkPinned}
              onDeleteBookmark={onDeleteBookmark}
            />
          ) : flatTables.length === 0 ? (
            <div className="empty-state">
              {/* Don't claim the connection is empty while the fetch is in flight. */}
              {loadingTables
                ? 'Loading tables...'
                : tables.length === 0
                  ? 'No tables or views found for this connection.'
                  : parsedSearch.text
                    ? 'No tables or views match your search.'
                    : 'No tables or views found in this schema.'}
            </div>
          ) : (
            listSections.map((section, index) => {
              const showDividerAfter =
                section.id === 'recent' &&
                index < listSections.length - 1 &&
                listSections[index + 1].tables.length > 0

              return (
                <div key={section.id}>
                  <div className={styles.tableCardSection}>
                    {section.label ? (
                      <div className={styles.tableCardSectionLabel}>{section.label}</div>
                    ) : null}
                    {section.tables.map((table) => {
                      const tableKey = toTableKey(table.schema, table.table)
                      const itemKey = tableItemKey(section.id, tableKey)
                      return (
                        <SidebarTableCard
                          key={itemKey}
                          ref={(node) => {
                            itemRefs.current[itemKey] = node
                          }}
                          table={table}
                          tableKey={tableKey}
                          isActive={activeTable === tableKey && activeTableItemKey === itemKey}
                          isPinned={pinnedKeys.includes(tableKey)}
                          showSchema={searchAllSchemas}
                          onSelect={() => handleSelectTable(tableKey, itemKey)}
                          onFocus={() => setFocusedKey(tableKey)}
                          onTogglePin={() => togglePinned(connectionName, tableKey)}
                        />
                      )
                    })}
                  </div>
                  {showDividerAfter ? (
                    <div className={styles.tableCardSectionDivider} role="separator" aria-hidden="true" />
                  ) : null}
                </div>
              )
            })
          )}
        </div>

        {onWidthResizerMouseDown ? (
          <div
            className="width-resizer"
            onMouseDown={onWidthResizerMouseDown}
            title="Drag to resize sidebar"
          />
        ) : null}
      </aside>
    </>
  )
}
