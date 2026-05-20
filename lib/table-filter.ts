import { getColumnKind, type ColumnKind } from './table-column-kind'

export const TABLE_FILTER_MODES = [
  'contains',
  'not_contains',
  'equals',
  'not_equals',
  'starts_with',
  'ends_with',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'is_empty',
  'is_not_empty',
  'is_null',
  'is_not_null',
] as const

export type TableFilterMode = (typeof TABLE_FILTER_MODES)[number]

export const TABLE_FILTER_MODE_OPTIONS: Array<{ value: TableFilterMode; label: string }> = [
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'between', label: 'between' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
  { value: 'is_null', label: 'is null' },
  { value: 'is_not_null', label: 'is not null' },
]

const NULL_CHECK_MODES: TableFilterMode[] = ['is_empty', 'is_not_empty', 'is_null', 'is_not_null']
const NO_VALUE_MODES: TableFilterMode[] = NULL_CHECK_MODES
const SLOW_FILTER_MODES: TableFilterMode[] = ['contains', 'not_contains', 'starts_with', 'ends_with']

const FILTER_MODES_BY_KIND: Record<ColumnKind, TableFilterMode[]> = {
  text: [
    'contains',
    'not_contains',
    'equals',
    'not_equals',
    'starts_with',
    'ends_with',
    'is_empty',
    'is_not_empty',
    'is_null',
    'is_not_null',
  ],
  numeric: [
    'equals',
    'not_equals',
    'gt',
    'gte',
    'lt',
    'lte',
    'between',
    'is_empty',
    'is_not_empty',
    'is_null',
    'is_not_null',
  ],
  boolean: ['equals', 'not_equals', 'is_null', 'is_not_null'],
  date: ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null'],
  datetime: ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null'],
  uuid: ['equals', 'not_equals', 'is_null', 'is_not_null'],
  json: ['contains', 'not_contains', 'equals', 'is_null', 'is_not_null'],
}

const DEFAULT_FILTER_MODE_BY_KIND: Record<ColumnKind, TableFilterMode> = {
  text: 'contains',
  numeric: 'equals',
  boolean: 'equals',
  date: 'equals',
  datetime: 'equals',
  uuid: 'equals',
  json: 'contains',
}

export function isFilterModeAllowedForColumnKind(mode: TableFilterMode, kind: ColumnKind): boolean {
  return FILTER_MODES_BY_KIND[kind].includes(mode)
}

export function defaultFilterModeForColumnKind(kind: ColumnKind): TableFilterMode {
  return DEFAULT_FILTER_MODE_BY_KIND[kind]
}

export function getFilterModeOptionsForColumnKind(kind: ColumnKind) {
  const allowed = new Set(FILTER_MODES_BY_KIND[kind])
  return TABLE_FILTER_MODE_OPTIONS.filter((option) => allowed.has(option.value))
}

export function parseFilterMode(value: unknown, kind: ColumnKind = 'text'): TableFilterMode {
  if (typeof value === 'string' && TABLE_FILTER_MODES.includes(value as TableFilterMode)) {
    const mode = value as TableFilterMode
    if (isFilterModeAllowedForColumnKind(mode, kind)) return mode
  }
  return defaultFilterModeForColumnKind(kind)
}

export function filterModeNeedsValue(mode: TableFilterMode): boolean {
  return !NO_VALUE_MODES.includes(mode)
}

export function filterModeNeedsEndValue(mode: TableFilterMode): boolean {
  return mode === 'between'
}

export function isSlowFilterMode(mode: TableFilterMode): boolean {
  return SLOW_FILTER_MODES.includes(mode)
}

export function hasActiveTableFilter(
  filterColumn: string,
  filterMode: TableFilterMode,
  filterValue: string,
  filterValueEnd = ''
): boolean {
  if (!filterColumn) return false
  if (!filterModeNeedsValue(filterMode)) return true
  if (filterModeNeedsEndValue(filterMode)) {
    return Boolean(filterValue.trim() && filterValueEnd.trim())
  }
  return Boolean(filterValue.trim())
}

export function formatTableFilterSummary(
  filterColumn: string,
  filterMode: TableFilterMode,
  filterValue: string,
  filterValueEnd = ''
): string | null {
  if (!hasActiveTableFilter(filterColumn, filterMode, filterValue, filterValueEnd)) return null

  const operator =
    TABLE_FILTER_MODE_OPTIONS.find((option) => option.value === filterMode)?.label ?? filterMode

  if (!filterModeNeedsValue(filterMode)) {
    return `${filterColumn} ${operator}`
  }

  if (filterModeNeedsEndValue(filterMode)) {
    return `${filterColumn} ${operator} ${filterValue.trim()} and ${filterValueEnd.trim()}`
  }

  return `${filterColumn} ${operator} ${filterValue.trim()}`
}

export function coerceFilterValue(value: string, kind: ColumnKind, mode: TableFilterMode): string | null {
  if (!filterModeNeedsValue(mode)) return ''
  if (filterModeNeedsEndValue(mode)) return coerceFilterValue(value, kind, 'equals')

  const trimmed = value.trim()
  if (!trimmed) return null

  switch (kind) {
    case 'numeric': {
      const parsed = Number(trimmed)
      if (!Number.isFinite(parsed)) return null
      return trimmed
    }
    case 'boolean': {
      const lower = trimmed.toLowerCase()
      if (['true', 't', '1', 'yes'].includes(lower)) return 'true'
      if (['false', 'f', '0', 'no'].includes(lower)) return 'false'
      return null
    }
    case 'date':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
      return trimmed
    case 'datetime': {
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00`
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) return trimmed
      const parsed = new Date(trimmed)
      if (Number.isNaN(parsed.getTime())) return null
      const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
      return local.toISOString().slice(0, 16)
    }
    case 'uuid':
      if (!/^[0-9a-f-]{36}$/i.test(trimmed)) return null
      return trimmed
    default:
      return trimmed
  }
}

function buildNullCheckFilter(
  columnSql: string,
  mode: TableFilterMode,
  kind: ColumnKind
): { whereClause: string; params: string[] } | null {
  const cast = `cast(${columnSql} as text)`

  switch (mode) {
    case 'is_null':
      return { whereClause: ` where ${columnSql} is null `, params: [] }
    case 'is_not_null':
      return { whereClause: ` where ${columnSql} is not null `, params: [] }
    case 'is_empty':
      return kind === 'text'
        ? { whereClause: ` where coalesce(${cast}, '') = '' `, params: [] }
        : { whereClause: ` where ${columnSql} is null `, params: [] }
    case 'is_not_empty':
      return kind === 'text'
        ? { whereClause: ` where coalesce(${cast}, '') <> '' `, params: [] }
        : { whereClause: ` where ${columnSql} is not null `, params: [] }
    default:
      return null
  }
}

function buildTextFilter(
  columnSql: string,
  mode: TableFilterMode,
  value: string
): { whereClause: string; params: string[] } | null {
  const cast = `cast(${columnSql} as text)`

  switch (mode) {
    case 'contains':
      return { whereClause: ` where ${cast} ilike $1 `, params: [`%${value}%`] }
    case 'not_contains':
      return { whereClause: ` where ${cast} not ilike $1 `, params: [`%${value}%`] }
    case 'equals':
      return { whereClause: ` where ${cast} = $1 `, params: [value] }
    case 'not_equals':
      return { whereClause: ` where ${cast} <> $1 `, params: [value] }
    case 'starts_with':
      return { whereClause: ` where ${cast} ilike $1 `, params: [`${value}%`] }
    case 'ends_with':
      return { whereClause: ` where ${cast} ilike $1 `, params: [`%${value}`] }
    default:
      return null
  }
}

function buildNumericFilter(
  columnSql: string,
  mode: TableFilterMode,
  value: string,
  valueEnd: string
): { whereClause: string; params: string[] } | null {
  switch (mode) {
    case 'equals':
      return { whereClause: ` where ${columnSql} = $1::numeric `, params: [value] }
    case 'not_equals':
      return { whereClause: ` where ${columnSql} <> $1::numeric `, params: [value] }
    case 'gt':
      return { whereClause: ` where ${columnSql} > $1::numeric `, params: [value] }
    case 'gte':
      return { whereClause: ` where ${columnSql} >= $1::numeric `, params: [value] }
    case 'lt':
      return { whereClause: ` where ${columnSql} < $1::numeric `, params: [value] }
    case 'lte':
      return { whereClause: ` where ${columnSql} <= $1::numeric `, params: [value] }
    case 'between':
      return {
        whereClause: ` where ${columnSql} >= $1::numeric and ${columnSql} <= $2::numeric `,
        params: [value, valueEnd],
      }
    default:
      return null
  }
}

function buildBooleanFilter(
  columnSql: string,
  mode: TableFilterMode,
  value: string
): { whereClause: string; params: string[] } | null {
  switch (mode) {
    case 'equals':
      return { whereClause: ` where ${columnSql} = $1::boolean `, params: [value] }
    case 'not_equals':
      return { whereClause: ` where ${columnSql} <> $1::boolean `, params: [value] }
    default:
      return null
  }
}

function buildTemporalFilter(
  columnSql: string,
  mode: TableFilterMode,
  value: string,
  valueEnd: string,
  castType: 'date' | 'timestamptz'
): { whereClause: string; params: string[] } | null {
  const expr = castType === 'date' ? `${columnSql}::date` : `${columnSql}::timestamptz`
  const paramCast = castType === 'date' ? 'date' : 'timestamptz'

  switch (mode) {
    case 'equals':
      return { whereClause: ` where ${expr} = $1::${paramCast} `, params: [value] }
    case 'not_equals':
      return { whereClause: ` where ${expr} <> $1::${paramCast} `, params: [value] }
    case 'gt':
      return { whereClause: ` where ${expr} > $1::${paramCast} `, params: [value] }
    case 'gte':
      return { whereClause: ` where ${expr} >= $1::${paramCast} `, params: [value] }
    case 'lt':
      return { whereClause: ` where ${expr} < $1::${paramCast} `, params: [value] }
    case 'lte':
      return { whereClause: ` where ${expr} <= $1::${paramCast} `, params: [value] }
    case 'between':
      return {
        whereClause: ` where ${expr} >= $1::${paramCast} and ${expr} <= $2::${paramCast} `,
        params: [value, valueEnd],
      }
    default:
      return null
  }
}

function buildUuidFilter(
  columnSql: string,
  mode: TableFilterMode,
  value: string
): { whereClause: string; params: string[] } | null {
  switch (mode) {
    case 'equals':
      return { whereClause: ` where ${columnSql}::text = $1 `, params: [value] }
    case 'not_equals':
      return { whereClause: ` where ${columnSql}::text <> $1 `, params: [value] }
    default:
      return null
  }
}

export function buildTableRowFilter(
  columnSql: string,
  mode: TableFilterMode,
  value: string,
  dataType: string,
  valueEnd = ''
): { whereClause: string; params: string[] } | null {
  const kind = getColumnKind(dataType)
  if (!isFilterModeAllowedForColumnKind(mode, kind)) return null

  if (NULL_CHECK_MODES.includes(mode)) {
    return buildNullCheckFilter(columnSql, mode, kind)
  }

  switch (kind) {
    case 'numeric':
      return buildNumericFilter(columnSql, mode, value, valueEnd)
    case 'boolean':
      return buildBooleanFilter(columnSql, mode, value)
    case 'date':
      return buildTemporalFilter(columnSql, mode, value, valueEnd, 'date')
    case 'datetime':
      return buildTemporalFilter(columnSql, mode, value, valueEnd, 'timestamptz')
    case 'uuid':
      return buildUuidFilter(columnSql, mode, value)
    case 'json':
      return buildTextFilter(columnSql, mode, value)
    default:
      return buildTextFilter(columnSql, mode, value)
  }
}
