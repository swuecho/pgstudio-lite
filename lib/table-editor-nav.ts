import type { RelationKind } from './relation-kind'
import type { TableInfo } from '../components/table-editor/types'

export type TableListSortMode = 'name' | 'kind' | 'size'

export type TableSearchQuery = {
  text: string
  kindFilter: RelationKind | null
}

export const ROW_COUNT_TOOLTIP =
  'Approximate row count from PostgreSQL table statistics (pg_class.reltuples). May be 0 or outdated until ANALYZE runs.'

export function parseTableSearchQuery(raw: string): TableSearchQuery {
  const trimmed = raw.trim()
  const lower = trimmed.toLowerCase()
  if (lower.startsWith('mv:')) {
    return { text: trimmed.slice(3).trim(), kindFilter: 'materialized_view' }
  }
  if (lower.startsWith('view:')) {
    return { text: trimmed.slice(5).trim(), kindFilter: 'view' }
  }
  if (lower.startsWith('table:')) {
    return { text: trimmed.slice(6).trim(), kindFilter: 'table' }
  }
  return { text: trimmed, kindFilter: null }
}

export function formatCompactRowCount(count: number): string {
  const n = Math.max(0, Math.floor(count))
  if (n < 1000) return String(n)
  if (n < 1_000_000) {
    const value = n / 1000
    return value >= 100 ? `${Math.round(value)}k` : `${trimTrailingZero(value.toFixed(1))}k`
  }
  const value = n / 1_000_000
  return value >= 100 ? `${Math.round(value)}M` : `${trimTrailingZero(value.toFixed(1))}M`
}

function trimTrailingZero(value: string) {
  return value.replace(/\.0$/, '')
}

export function formatRowCountLabel(count: number) {
  return `~${formatCompactRowCount(count)} rows`
}

export const MAX_RECENT_TABLES = 5

export function toTableKey(schema: string, table: string) {
  return `${schema}.${table}`
}

export function compareTablesByName(a: TableInfo, b: TableInfo) {
  return a.table.localeCompare(b.table) || a.schema.localeCompare(b.schema)
}

export type TableListGroup = {
  id: string
  label: string
  tables: TableInfo[]
}

export function filterTables(
  tables: TableInfo[],
  options: {
    schema: string
    search: TableSearchQuery
    searchAllSchemas: boolean
  }
): TableInfo[] {
  const { schema, search, searchAllSchemas } = options
  const query = search.text.toLowerCase()

  return tables.filter((table) => {
    if (!searchAllSchemas && schema && table.schema !== schema) return false
    if (search.kindFilter && table.kind !== search.kindFilter) return false
    if (!query) return true

    const fullName = `${table.schema}.${table.table}`.toLowerCase()
    return (
      fullName.includes(query) ||
      table.table.toLowerCase().includes(query) ||
      table.schema.toLowerCase().includes(query)
    )
  })
}

export function sortTables(tables: TableInfo[], mode: TableListSortMode): TableInfo[] {
  const copy = [...tables]
  if (mode === 'size') {
    return copy.sort(
      (a, b) =>
        b.estimatedRows - a.estimatedRows ||
        a.table.localeCompare(b.table) ||
        a.schema.localeCompare(b.schema)
    )
  }
  if (mode === 'kind') {
    const kindOrder: Record<RelationKind, number> = {
      table: 0,
      view: 1,
      materialized_view: 2,
    }
    return copy.sort(
      (a, b) =>
        kindOrder[a.kind] - kindOrder[b.kind] ||
        a.table.localeCompare(b.table) ||
        a.schema.localeCompare(b.schema)
    )
  }
  return copy.sort(compareTablesByName)
}

export function groupTablesByKind(tables: TableInfo[]): TableListGroup[] {
  const buckets: TableListGroup[] = [
    { id: 'table', label: 'Tables', tables: [] },
    { id: 'view', label: 'Views', tables: [] },
    { id: 'materialized_view', label: 'Materialized views', tables: [] },
  ]

  for (const table of tables) {
    const bucket = buckets.find((group) => group.id === table.kind)
    if (bucket) bucket.tables.push(table)
  }

  return buckets.filter((group) => group.tables.length > 0)
}

export function partitionPinnedRecent(
  allTables: TableInfo[],
  pinnedKeys: string[],
  recentKeys: string[],
  visibleTables: TableInfo[] = allTables
) {
  const byKey = new Map(allTables.map((table) => [toTableKey(table.schema, table.table), table]))
  const used = new Set<string>()

  const pinned: TableInfo[] = []
  for (const key of pinnedKeys) {
    const table = byKey.get(key)
    if (!table) continue
    pinned.push(table)
    used.add(key)
  }

  const recent: TableInfo[] = []
  for (const key of recentKeys.slice(0, MAX_RECENT_TABLES)) {
    if (!key || used.has(key)) continue
    const table = byKey.get(key)
    if (!table) continue
    recent.push(table)
    used.add(key)
  }
  recent.sort(compareTablesByName)

  const rest = visibleTables.filter((table) => !used.has(toTableKey(table.schema, table.table)))
  return { pinned, recent, rest }
}

export function flattenTableListSections(sections: Array<{ tables: TableInfo[] }>) {
  return sections.flatMap((section) => section.tables)
}
