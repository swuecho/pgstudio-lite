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

/**
 * The value behind a cell as parsed JSON, or `null` when it is not JSON we can
 * render as a tree (scalars included: a bare number is valid JSON but there is
 * nothing to expand).
 */
export function parseJsonForView(value: unknown, dataType?: string): { data: unknown } | null {
  const kind = dataType ? getColumnKind(dataType) : null
  let parsed: unknown = value

  if (typeof value === 'string') {
    if (kind !== 'json' && !looksLikeJsonContainer(value)) return null
    try {
      parsed = JSON.parse(value)
    } catch {
      return null
    }
  }

  if (parsed === null || typeof parsed !== 'object') return null
  return { data: parsed }
}

function looksLikeJsonContainer(text: string): boolean {
  const trimmed = text.trim()
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))
  )
}
