import { getColumnKind } from './table-column-kind'
import {
  coerceFilterValue,
  filterModeNeedsEndValue,
  filterModeNeedsValue,
  hasActiveTableFilter,
  parseFilterMode,
} from './table-filter'

export type TableColumnRef = {
  name: string
  dataType: string
}

export function sanitizeRowsQueryOptions(
  columns: TableColumnRef[],
  options: {
    sortBy?: string
    filterColumn?: string
    filterValue?: string
    filterValueEnd?: string
    filterMode?: unknown
  }
) {
  const names = new Set(columns.map((column) => column.name))
  const sortBy = options.sortBy && names.has(options.sortBy) ? options.sortBy : ''
  const filterColumn = options.filterColumn && names.has(options.filterColumn) ? options.filterColumn : ''
  const columnMeta = columns.find((column) => column.name === filterColumn)
  const columnKind = getColumnKind(columnMeta?.dataType ?? 'text')
  const filterMode = parseFilterMode(options.filterMode, columnKind)
  let filterValue = filterColumn && filterModeNeedsValue(filterMode) ? (options.filterValue || '').trim() : ''
  let filterValueEnd =
    filterColumn && filterModeNeedsEndValue(filterMode) ? (options.filterValueEnd || '').trim() : ''

  if (filterColumn && filterModeNeedsValue(filterMode)) {
    if (filterModeNeedsEndValue(filterMode)) {
      filterValue = coerceFilterValue(filterValue, columnKind, 'equals') ?? ''
      filterValueEnd = coerceFilterValue(filterValueEnd, columnKind, 'equals') ?? ''
    } else {
      filterValue = coerceFilterValue(filterValue, columnKind, filterMode) ?? ''
    }
  }

  if (
    filterColumn &&
    !hasActiveTableFilter(filterColumn, filterMode, filterValue, filterValueEnd)
  ) {
    filterValue = ''
    filterValueEnd = ''
  }

  return {
    sortBy,
    filterColumn,
    filterValue,
    filterValueEnd,
    filterMode,
    columnDataType: columnMeta?.dataType ?? 'text',
  }
}
