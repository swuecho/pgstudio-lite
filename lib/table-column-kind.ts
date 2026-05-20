export type ColumnKind = 'text' | 'numeric' | 'boolean' | 'date' | 'datetime' | 'uuid' | 'json'

export function getColumnKind(dataType: string): ColumnKind {
  const lower = dataType.toLowerCase()

  if (lower === 'boolean') return 'boolean'
  if (lower === 'uuid') return 'uuid'
  if (lower === 'json' || lower === 'jsonb') return 'json'
  if (lower === 'date') return 'date'
  if (lower.includes('timestamp') || lower === 'time without time zone' || lower === 'time with time zone') {
    return 'datetime'
  }
  if (isNumericDataType(lower)) return 'numeric'

  return 'text'
}

export function isNumericDataType(lowerDataType: string) {
  return (
    lowerDataType.includes('int') ||
    lowerDataType === 'numeric' ||
    lowerDataType === 'decimal' ||
    lowerDataType.includes('double') ||
    lowerDataType.includes('real') ||
    lowerDataType.includes('serial') ||
    lowerDataType === 'money'
  )
}

export function isBooleanColumn(dataType: string) {
  return getColumnKind(dataType) === 'boolean'
}

export function isNumericColumn(dataType: string) {
  return getColumnKind(dataType) === 'numeric'
}

export function isDateColumn(dataType: string) {
  return getColumnKind(dataType) === 'date'
}

export function isDateTimeColumn(dataType: string) {
  return getColumnKind(dataType) === 'datetime'
}

export function isJsonColumn(dataType: string) {
  return getColumnKind(dataType) === 'json'
}

export function isUuidColumn(dataType: string) {
  return getColumnKind(dataType) === 'uuid'
}

/** datetime-local input is browser-local; SQL uses timestamptz for comparisons. */
export const DATETIME_FILTER_TIMEZONE_HINT =
  'Times use your browser timezone and are compared as timestamptz in PostgreSQL.'
