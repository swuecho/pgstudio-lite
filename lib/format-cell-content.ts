import { getColumnKind } from './table-column-kind'

export function formatCellContentForView(value: unknown, dataType?: string): string {
  if (value === null || value === undefined) return 'null'

  const kind = dataType ? getColumnKind(dataType) : null

  if (kind === 'json' && typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return value
    }
  }

  if (kind === 'json' || (typeof value === 'object' && value !== null)) {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  return String(value)
}

export function canOpenCellViewer(dataType: string | undefined, value: unknown): boolean {
  if (dataType) {
    const kind = getColumnKind(dataType)
    if (kind === 'json' || kind === 'text') return true
  }
  return formatCellContentForView(value, dataType).length > 100
}
