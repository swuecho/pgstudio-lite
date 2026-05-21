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
import { EMPTY_TABLE_KEYS, useTableEditorNavStore } from './stores/tableEditorNavStore'
import { useTableEditorSchemaStore } from './stores/tableEditorSchemaStore'
import { TableInfo } from './types'
import styles from './TableEditorStyles.module.css'

type TableSidebarProps = {
  connectionName: string
  tables: TableInfo[]
  tablesTruncated: boolean
  loadingTables: boolean
  activeTable: string
  onSelectTable: (table: string) => void
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
  onSelectTable,
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

  const [tableSearch, setTableSearch] = useState('')
  const [sortMode, setSortMode] = useState<TableListSortMode>('name')
  const [focusedKey, setFocusedKey] = useState('')

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

        {tablesTruncated ? (
          <div className={styles.tableListNotice} role="status">
            Showing first 500 tables. Narrow your schema or search to find others.
          </div>
        ) : null}

        <div
          ref={listRef}
          className={`layout-nav-list ${styles.tableCardsList} ${loadingTables ? styles.tableCardsListLoading : ''}`}
          role="listbox"
          aria-label="Tables and views"
          aria-busy={loadingTables}
          tabIndex={0}
          onKeyDown={handleListKeyDown}
        >
          {flatTables.length === 0 ? (
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
