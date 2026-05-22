import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import ThemeToggle from '../theme-toggle'
import { RelationKindBadge } from '../shared/RelationKindBadge'
import {
  filterTables,
  flattenTableListSections,
  formatRowCountLabel,
  groupTablesByKind,
  parseTableSearchQuery,
  partitionPinnedRecent,
  ROW_COUNT_TOOLTIP,
  sortTables,
  toTableKey,
  type TableListGroup,
  type TableListSortMode,
} from '../../lib/table-editor-nav'
import {
  filterViews,
  formatRelativeTime,
  formatViewLabel,
  isSameView,
  partitionViewBookmarks,
  viewStateKey,
  type TableEditorBookmark,
  type TableEditorRecentView,
  type TableEditorViewState,
} from '../../lib/table-editor-views'
import { EMPTY_TABLE_KEYS, useTableEditorNavStore } from './stores/tableEditorNavStore'
import { useTableEditorSchemaStore } from './stores/tableEditorSchemaStore'
import { TableInfo } from './types'
import styles from './TableEditorStyles.module.css'

type TableSidebarNavTab = 'tables' | 'views'

type TableSidebarProps = {
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

type TableListSection = {
  id: string
  label: string
  tables: TableInfo[]
}

export function TableSidebar({
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
  const [focusedKey, setFocusedKey] = useState('')
  const [renamingBookmarkId, setRenamingBookmarkId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const lastRecordedTableRef = useRef('')

  const parsedSearch = useMemo(() => parseTableSearchQuery(tableSearch), [tableSearch])
  const searchAllSchemas = parsedSearch.text.length > 0

  const availableSchemas = useMemo(
    () => Array.from(new Set(tables.map((table) => table.schema))).sort((a, b) => a.localeCompare(b)),
    [tables]
  )

  const selectedSchema = useMemo(() => {
    if (availableSchemas.length === 0) return ''

    if (persistedSchema && availableSchemas.includes(persistedSchema)) return persistedSchema

    const activeSchema = activeTable.split('.')[0] || ''
    if (activeSchema && availableSchemas.includes(activeSchema)) return activeSchema

    return availableSchemas[0]
  }, [activeTable, availableSchemas, persistedSchema])

  const filteredTables = useMemo(
    () =>
      filterTables(tables, {
        schema: selectedSchema,
        search: parsedSearch,
        searchAllSchemas,
      }),
    [parsedSearch, searchAllSchemas, selectedSchema, tables]
  )

  const sortedTables = useMemo(() => sortTables(filteredTables, sortMode), [filteredTables, sortMode])

  const { pinned, recent, rest } = useMemo(
    () => partitionPinnedRecent(tables, pinnedKeys, recentKeys, sortedTables),
    [pinnedKeys, recentKeys, sortedTables, tables]
  )

  const mainSections = useMemo((): TableListSection[] => {
    if (sortMode === 'kind') {
      return groupTablesByKind(rest).map((group: TableListGroup) => ({
        id: group.id,
        label: group.label,
        tables: group.tables,
      }))
    }
    return [{ id: 'all', label: '', tables: rest }]
  }, [rest, sortMode])

  const listSections = useMemo(
    () =>
      [
        pinned.length > 0 ? { id: 'pinned', label: 'Pinned', tables: pinned } : null,
        recent.length > 0 ? { id: 'recent', label: 'Recent', tables: recent } : null,
        ...mainSections,
      ].filter((section): section is TableListSection => section !== null),
    [mainSections, pinned, recent]
  )

  const flatTables = useMemo(() => flattenTableListSections(listSections), [listSections])
  const matchCount = flatTables.length

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
  const filteredRecentViews = useMemo(
    () => filterViews(recentViews, viewsSearch),
    [recentViews, viewsSearch]
  )

  const viewsMatchCount =
    filteredPinnedBookmarks.length + filteredBookmarks.length + filteredRecentViews.length

  const handleSelectTable = useCallback(
    (tableKey: string) => {
      onSelectTable(tableKey)
      setFocusedKey(tableKey)
    },
    [onSelectTable]
  )

  useEffect(() => {
    lastRecordedTableRef.current = ''
  }, [connectionName])

  useEffect(() => {
    if (!connectionName || !activeTable) return
    if (lastRecordedTableRef.current === activeTable) return
    lastRecordedTableRef.current = activeTable
    recordRecent(connectionName, activeTable)
  }, [activeTable, connectionName, recordRecent])

  const scrollActiveIntoView = useCallback(() => {
    if (!activeTable) return
    const node = itemRefs.current[activeTable]
    node?.scrollIntoView({ block: 'nearest' })
  }, [activeTable])

  useEffect(() => {
    scrollActiveIntoView()
  }, [activeTable, flatTables.length, scrollActiveIntoView])

  useEffect(() => {
    if (!activeTable) return
    setFocusedKey(activeTable)
  }, [activeTable])

  const moveFocus = useCallback(
    (delta: number) => {
      if (flatTables.length === 0) return
      const currentIndex = flatTables.findIndex(
        (table) => toTableKey(table.schema, table.table) === (focusedKey || activeTable)
      )
      const startIndex = currentIndex >= 0 ? currentIndex : 0
      const nextIndex = Math.min(flatTables.length - 1, Math.max(0, startIndex + delta))
      const nextTable = flatTables[nextIndex]
      const nextKey = toTableKey(nextTable.schema, nextTable.table)
      setFocusedKey(nextKey)
      itemRefs.current[nextKey]?.focus()
      itemRefs.current[nextKey]?.scrollIntoView({ block: 'nearest' })
    },
    [activeTable, flatTables, focusedKey]
  )

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(-1)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      const first = flatTables[0]
      if (!first) return
      const key = toTableKey(first.schema, first.table)
      setFocusedKey(key)
      itemRefs.current[key]?.focus()
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      const last = flatTables[flatTables.length - 1]
      if (!last) return
      const key = toTableKey(last.schema, last.table)
      setFocusedKey(key)
      itemRefs.current[key]?.focus()
    }
  }

  const renderTableButton = (table: TableInfo, options?: { showSchema?: boolean }) => {
    const tableKey = toTableKey(table.schema, table.table)
    const isActive = activeTable === tableKey
    const isPinned = pinnedKeys.includes(tableKey)
    const showSchema = options?.showSchema ?? searchAllSchemas

    return (
      <div
        key={tableKey}
        ref={(node) => {
          itemRefs.current[tableKey] = node
        }}
        role="option"
        tabIndex={0}
        aria-selected={isActive}
        aria-current={isActive ? 'true' : undefined}
        className={`${styles.tableCard} ${isActive ? styles.tableCardActive : ''}`}
        onClick={() => handleSelectTable(tableKey)}
        onFocus={() => setFocusedKey(tableKey)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            handleSelectTable(tableKey)
          }
        }}
      >
        <div className={styles.tableCardHeader}>
          <div className={styles.tableCardNameRow}>
            <div className={styles.tableCardName} title={showSchema ? tableKey : table.table}>
              {showSchema ? (
                <>
                  <span className={styles.tableCardSchema}>{table.schema}.</span>
                  {table.table}
                </>
              ) : (
                table.table
              )}
            </div>
            <RelationKindBadge kind={table.kind} compact />
          </div>
          <div className={styles.tableCardActions}>
            <span className={styles.tableCardRows} title={ROW_COUNT_TOOLTIP}>
              {formatRowCountLabel(table.estimatedRows)}
            </span>
            <button
              type="button"
              className={`${styles.tableCardPin} ${isPinned ? styles.tableCardPinActive : ''}`}
              aria-label={isPinned ? `Unpin ${tableKey}` : `Pin ${tableKey}`}
              aria-pressed={isPinned}
              title={isPinned ? 'Unpin' : 'Pin'}
              onClick={(event) => {
                event.stopPropagation()
                togglePinned(connectionName, tableKey)
              }}
            >
              {isPinned ? '★' : '☆'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderViewItem = (
    view: TableEditorViewState,
    options: {
      key: string
      title?: string
      subtitle?: string
      timestamp?: string
      bookmark?: TableEditorBookmark
    }
  ) => {
    const isActive = currentView ? isSameView(currentView, view) : false

    return (
      <div
        key={options.key}
        className={`history-item ${styles.viewItem} ${isActive ? styles.viewItemActive : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => onNavigateToView(view)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onNavigateToView(view)
          }
        }}
      >
        <div className={styles.viewItemTop}>
          <span className={`pill ${options.bookmark ? 'ok' : ''}`.trim()}>
            {options.bookmark ? 'bookmark' : 'recent'}
          </span>
          {options.bookmark && renamingBookmarkId === options.bookmark.id ? (
            <input
              className={styles.viewTitleInput}
              value={renameDraft}
              autoFocus
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => setRenameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void onRenameBookmark(options.bookmark!.id, renameDraft)
                  setRenamingBookmarkId(null)
                }
                if (event.key === 'Escape') setRenamingBookmarkId(null)
              }}
              onBlur={() => {
                void onRenameBookmark(options.bookmark!.id, renameDraft)
                setRenamingBookmarkId(null)
              }}
            />
          ) : (
            <span className={styles.viewItemTitle}>{options.title ?? formatViewLabel(view)}</span>
          )}
        </div>
        <div className={styles.viewItemQuery}>{options.subtitle ?? formatViewLabel(view)}</div>
        {options.timestamp ? <div className="history-meta">{options.timestamp}</div> : null}
        {options.bookmark ? (
          <div className="history-actions">
            <button
              className="btn small"
              onClick={(event) => {
                event.stopPropagation()
                void onToggleBookmarkPinned(options.bookmark!.id)
              }}
            >
              {options.bookmark.pinned ? 'Unpin' : 'Pin'}
            </button>
            {renamingBookmarkId === options.bookmark.id ? (
              <button
                className="btn small"
                onClick={(event) => {
                  event.stopPropagation()
                  void onRenameBookmark(options.bookmark!.id, renameDraft)
                  setRenamingBookmarkId(null)
                }}
              >
                Apply
              </button>
            ) : (
              <button
                className="btn small"
                onClick={(event) => {
                  event.stopPropagation()
                  setRenamingBookmarkId(options.bookmark!.id)
                  setRenameDraft(options.bookmark!.title)
                }}
              >
                Rename
              </button>
            )}
            <button
              className="btn small danger"
              onClick={(event) => {
                event.stopPropagation()
                void onDeleteBookmark(options.bookmark!.id)
              }}
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  const renderViewsList = () => {
    if (viewsMatchCount === 0) {
      return (
        <div className="empty-state">
          {viewsSearch.trim()
            ? 'No views match your search.'
            : 'No saved or recent views yet. Open a table or filter, then use Save view.'}
        </div>
      )
    }

    return (
      <>
        {filteredPinnedBookmarks.length > 0 ? (
          <div className={styles.viewSection}>
            <div className={styles.viewSectionLabel}>Pinned</div>
            {filteredPinnedBookmarks.map((bookmark) =>
              renderViewItem(bookmark, {
                key: bookmark.id,
                title: bookmark.title,
                subtitle: formatViewLabel(bookmark),
                timestamp: formatRelativeTime(bookmark.createdAt),
                bookmark,
              })
            )}
          </div>
        ) : null}
        {filteredBookmarks.length > 0 ? (
          <div className={styles.viewSection}>
            <div className={styles.viewSectionLabel}>Bookmarks</div>
            {filteredBookmarks.map((bookmark) =>
              renderViewItem(bookmark, {
                key: bookmark.id,
                title: bookmark.title,
                subtitle: formatViewLabel(bookmark),
                timestamp: formatRelativeTime(bookmark.createdAt),
                bookmark,
              })
            )}
          </div>
        ) : null}
        {filteredRecentViews.length > 0 ? (
          <div className={styles.viewSection}>
            <div className={styles.viewSectionLabel}>Recent</div>
            {filteredRecentViews.map((view: TableEditorRecentView) =>
              renderViewItem(view, {
                key: viewStateKey(view),
                timestamp: formatRelativeTime(view.visitedAt),
              })
            )}
          </div>
        ) : null}
      </>
    )
  }

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
              placeholder="Search (table:, view:, mv:)"
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
            {matchCount} {matchCount === 1 ? 'table' : 'tables'}
            {searchAllSchemas ? ' · all schemas' : ''}
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
          ref={listRef}
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
            renderViewsList()
          ) : flatTables.length === 0 ? (
            <div className="empty-state">
              {tables.length === 0
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
                    {section.tables.map((table) => renderTableButton(table, { showSchema: searchAllSchemas }))}
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
