import { useMemo } from 'react'
import {
  filterTables,
  flattenTableListSections,
  groupTablesByKind,
  parseTableSearchQuery,
  partitionPinnedRecent,
  sortTables,
  toTableKey,
  type TableListGroup,
  type TableListSortMode,
} from '@/lib/table-editor-nav'
import type { TableInfo } from './types'

export type TableListSection = {
  id: string
  label: string
  tables: TableInfo[]
}

/** A table can appear in several sections (Recent and All), so list items are keyed per section. */
export type TableListItemKey = { itemKey: string; tableKey: string }

export function tableItemKey(sectionId: string, tableKey: string) {
  return `${sectionId}:${tableKey}`
}

/**
 * Turns the raw table list plus the sidebar's search, schema, sort, pin, and
 * recent state into the sections the list renders.
 */
export function useTableSidebarSections(input: {
  tables: TableInfo[]
  activeTable: string
  /** Schema the user picked for this connection, or '' for none. */
  persistedSchema: string
  tableSearch: string
  sortMode: TableListSortMode
  pinnedKeys: string[]
  recentKeys: string[]
}) {
  const { tables, activeTable, persistedSchema, tableSearch, sortMode, pinnedKeys, recentKeys } = input

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
    // Labelled so the Recent block above reads as a shortcut list rather than
    // duplicated rows: recent tables intentionally still appear here.
    return [{ id: 'all', label: 'All tables', tables: rest }]
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

  const visibleTableItemKeys = useMemo(
    (): TableListItemKey[] =>
      listSections.flatMap((section) =>
        section.tables.map((table) => {
          const tableKey = toTableKey(table.schema, table.table)
          return { itemKey: tableItemKey(section.id, tableKey), tableKey }
        })
      ),
    [listSections]
  )

  return {
    parsedSearch,
    searchAllSchemas,
    availableSchemas,
    selectedSchema,
    listSections,
    flatTables,
    visibleTableItemKeys,
  }
}
