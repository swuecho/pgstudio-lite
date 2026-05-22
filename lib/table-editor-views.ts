import { formatTableFilterSummary, hasActiveTableFilter } from './table-filter'
import type { TableEditorFilter } from '../components/table-editor/stores/tableEditorFilterStore'

export const MAX_RECENT_VIEWS = 15

export type TableEditorViewState = {
  connectionName: string
  activeTable: string
  filter?: TableEditorFilter
}

export type TableEditorBookmark = TableEditorViewState & {
  id: string
  title: string
  pinned: boolean
  createdAt: string
}

export type TableEditorRecentView = TableEditorViewState & {
  visitedAt: string
}

function truncate(value: string, max = 48) {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

function serializeFilter(filter?: TableEditorFilter): string {
  if (!filter) return ''
  return [
    filter.filterColumn,
    filter.filterMode,
    filter.filterValue.trim(),
    filter.filterValueEnd.trim(),
  ].join('\0')
}

export function viewStateKey(view: TableEditorViewState): string {
  return `${view.connectionName}\0${view.activeTable}\0${serializeFilter(view.filter)}`
}

export function isSameView(a: TableEditorViewState, b: TableEditorViewState): boolean {
  return viewStateKey(a) === viewStateKey(b)
}

export function buildViewState(args: {
  connectionName: string
  activeTable: string
  filterColumn: string
  filterMode: TableEditorFilter['filterMode']
  filterValue: string
  filterValueEnd: string
}): TableEditorViewState | null {
  if (!args.activeTable) return null

  const filter = hasActiveTableFilter(
    args.filterColumn,
    args.filterMode,
    args.filterValue,
    args.filterValueEnd
  )
    ? {
        filterColumn: args.filterColumn,
        filterMode: args.filterMode,
        filterValue: args.filterValue,
        filterValueEnd: args.filterValueEnd,
      }
    : undefined

  return {
    connectionName: args.connectionName,
    activeTable: args.activeTable,
    filter,
  }
}

export function formatViewLabel(view: TableEditorViewState): string {
  const tableLabel = view.activeTable.split('.').pop() || view.activeTable
  const filterSummary = view.filter
    ? formatTableFilterSummary(
        view.filter.filterColumn,
        view.filter.filterMode,
        view.filter.filterValue,
        view.filter.filterValueEnd
      )
    : null

  if (!filterSummary) return tableLabel
  return `${tableLabel} · ${truncate(filterSummary)}`
}

export function suggestBookmarkTitle(activeTable: string, filter?: TableEditorFilter): string {
  const tableLabel = activeTable.split('.').pop() || activeTable
  if (!filter) return tableLabel

  const filterSummary = formatTableFilterSummary(
    filter.filterColumn,
    filter.filterMode,
    filter.filterValue,
    filter.filterValueEnd
  )
  if (!filterSummary) return tableLabel
  return `${tableLabel} · ${truncate(filterSummary, 64)}`
}

export function formatViewSearchText(view: TableEditorViewState, title?: string): string {
  const parts = [view.connectionName, view.activeTable, title ?? '', formatViewLabel(view)]
  if (view.filter) {
    parts.push(
      view.filter.filterColumn,
      view.filter.filterMode,
      view.filter.filterValue,
      view.filter.filterValueEnd
    )
  }
  return parts.join(' ').toLowerCase()
}

export function filterViews<T extends TableEditorViewState>(
  items: T[],
  search: string,
  getTitle?: (item: T) => string | undefined
): T[] {
  const query = search.trim().toLowerCase()
  if (!query) return items
  return items.filter((item) => formatViewSearchText(item, getTitle?.(item)).includes(query))
}

export function partitionViewBookmarks(bookmarks: TableEditorBookmark[]) {
  const pinned = bookmarks.filter((bookmark) => bookmark.pinned)
  const unpinned = bookmarks.filter((bookmark) => !bookmark.pinned)
  return { pinned, unpinned }
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso

  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString()
}

export type TableEditorViewDbFields = {
  activeTable: string
  filterColumn: string | null
  filterMode: string | null
  filterValue: string | null
  filterValueEnd: string | null
  viewKey: string
}

export function viewStateToDbFields(view: TableEditorViewState): TableEditorViewDbFields {
  return {
    activeTable: view.activeTable,
    filterColumn: view.filter?.filterColumn ?? null,
    filterMode: view.filter?.filterMode ?? null,
    filterValue: view.filter?.filterValue ?? null,
    filterValueEnd: view.filter?.filterValueEnd ?? null,
    viewKey: viewStateKey(view),
  }
}

export function dbFieldsToViewState(args: {
  connectionName: string
  activeTable: string
  filterColumn: string | null
  filterMode: string | null
  filterValue: string | null
  filterValueEnd: string | null
}): TableEditorViewState {
  const filter =
    args.filterColumn && args.filterMode
      ? {
          filterColumn: args.filterColumn,
          filterMode: args.filterMode as TableEditorFilter['filterMode'],
          filterValue: args.filterValue ?? '',
          filterValueEnd: args.filterValueEnd ?? '',
        }
      : undefined

  return {
    connectionName: args.connectionName,
    activeTable: args.activeTable,
    filter,
  }
}
