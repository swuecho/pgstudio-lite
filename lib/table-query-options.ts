import { getColumnKind } from './table-column-kind'
import {
  coerceFilterValue,
  filterModeNeedsValue,
  parseFilterMode,
} from './table-filter'

export type TableColumnRef = {
  name: string
  dataType: string
}

export function sanitizeRowsQueryOptions(
  columns: TableColumnRef[],
  options: { sortBy?: string; filterColumn?: string; filterValue?: string; filterMode?: unknown }
) {
  const names = new Set(columns.map((column) => column.name))
  const sortBy = options.sortBy && names.has(options.sortBy) ? options.sortBy : ''
  const filterColumn = options.filterColumn && names.has(options.filterColumn) ? options.filterColumn : ''
  const columnMeta = columns.find((column) => column.name === filterColumn)
  const columnKind = getColumnKind(columnMeta?.dataType ?? 'text')
  const filterMode = parseFilterMode(options.filterMode, columnKind)
  let filterValue = filterColumn && filterModeNeedsValue(filterMode) ? (options.filterValue || '').trim() : ''

  if (filterColumn && filterModeNeedsValue(filterMode)) {
    const coerced = coerceFilterValue(filterValue, columnKind, filterMode)
    filterValue = coerced ?? ''
  }

  return { sortBy, filterColumn, filterValue, filterMode, columnDataType: columnMeta?.dataType ?? 'text' }
}
