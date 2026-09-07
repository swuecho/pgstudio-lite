import { isBooleanColumn, isDateColumn, isDateTimeColumn, isJsonColumn } from '@/lib/table-column-kind'
import type { RowKey } from './types'

/** Pure value formatting and normalization used by the table grid cells. */

export type GridEditorKind = 'bool' | 'date' | 'datetime' | 'json'

export function formatRowKey(rowKey: RowKey | null) {
  if (!rowKey) return 'Unavailable'
  try {
    return JSON.stringify(rowKey)
  } catch {
    return String(rowKey)
  }
}

/** Pretty-printed JSON for jsonb cells; strings that are not JSON pass through. */
export function formatJsonbPreview(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return value
    }
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** Single-line rendering of any cell value for confirmation dialogs. */
export function previewValue(value: unknown) {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function truncate(value: string, max = 220) {
  return value.length > max ? `${value.slice(0, max)}...` : value
}

export function getEditorKind(dataType: string): GridEditorKind | null {
  if (isBooleanColumn(dataType)) return 'bool'
  if (isDateColumn(dataType)) return 'date'
  if (isDateTimeColumn(dataType)) return 'datetime'
  if (isJsonColumn(dataType)) return 'json'
  return null
}

function normalizeDateValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toISOString().slice(0, 10)
}

function normalizeDateTimeValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value
  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) return String(value)
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function normalizeJsonValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value))
    } catch {
      return value.trim()
    }
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * Canonical form of a cell value for change detection, so that re-entering
 * the same date, boolean, or JSON in a different textual form is a no-op.
 */
export function normalizeValueForComparison(value: unknown, dataType: string) {
  if (isBooleanColumn(dataType)) return value === true
  if (isDateColumn(dataType)) return normalizeDateValue(value)
  if (isDateTimeColumn(dataType)) return normalizeDateTimeValue(value)
  if (isJsonColumn(dataType)) return normalizeJsonValue(value)
  if (value === null || value === undefined) return ''
  return String(value)
}

/** Value for an `<input type="date">`, or '' when unparseable. */
export function toDateInputValue(value: unknown) {
  if (typeof value !== 'string' || !value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

/** Value for an `<input type="datetime-local">` in the browser's timezone. */
export function toDateTimeInputValue(value: unknown) {
  if (typeof value !== 'string' || !value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}
