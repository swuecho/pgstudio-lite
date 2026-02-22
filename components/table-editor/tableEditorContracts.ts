import type { ColumnInfo, TableInfo } from './types'

export type ActiveTableTarget = {
  schema: string
  table: string
}

export function parseActiveTableKey(activeTableKey: string): ActiveTableTarget {
  const [schema, ...tableParts] = activeTableKey.split('.')
  const table = tableParts.join('.')
  if (!schema || !table) return { schema: 'public', table: activeTableKey }
  return { schema, table }
}

export function toActiveTableKey(schema: string, table: string) {
  return `${schema}.${table}`
}

export function resolveNextActiveTable(
  tables: TableInfo[],
  activeTable: string,
  loadingTables: boolean
): string | null {
  if (tables.length === 0) {
    // Keep any URL-selected table while tables are still loading.
    if (!loadingTables && activeTable) return ''
    return null
  }

  const hasCurrent = tables.some((table) => toActiveTableKey(table.schema, table.table) === activeTable)
  if (hasCurrent) return null
  return toActiveTableKey(tables[0].schema, tables[0].table)
}

export function resolveSortAndFilter(columns: ColumnInfo[], sortBy: string, filterColumn: string) {
  const hasColumns = columns.length > 0
  const canSortByCurrent = hasColumns && (sortBy === '_ctid' || columns.some((col) => col.name === sortBy))
  const canFilterByCurrent = !filterColumn || columns.some((col) => col.name === filterColumn)

  return {
    nextSortBy: canSortByCurrent ? sortBy : '_ctid',
    nextFilterColumn: canFilterByCurrent ? filterColumn : '',
  }
}
