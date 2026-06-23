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

/** Column kinds for which a sensible default value can be generated client-side. */
export function canGenerateValue(dataType: string) {
  const kind = getColumnKind(dataType)
  return kind === 'uuid' || kind === 'date' || kind === 'datetime'
}

/**
 * Produces a valid literal for the given column type: a random UUID for uuid
 * columns, today's date for date columns, and the current timestamp for
 * datetime columns. Returns null when nothing sensible can be generated.
 */
export function generateColumnValue(dataType: string): string | null {
  const now = new Date()
  switch (getColumnKind(dataType)) {
    case 'uuid':
      return crypto.randomUUID()
    case 'date':
      return now.toISOString().slice(0, 10)
    case 'datetime':
      return now.toISOString()
    default:
      return null
  }
}

/** datetime-local input is browser-local; SQL uses timestamptz for comparisons. */
export const DATETIME_FILTER_TIMEZONE_HINT =
  'Times use your browser timezone and are compared as timestamptz in PostgreSQL.'
