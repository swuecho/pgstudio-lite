export type ColumnKind = 'text' | 'numeric' | 'boolean' | 'date' | 'datetime'

export function getColumnKind(dataType: string): ColumnKind {
  const lower = dataType.toLowerCase()

  if (lower === 'boolean') return 'boolean'
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
