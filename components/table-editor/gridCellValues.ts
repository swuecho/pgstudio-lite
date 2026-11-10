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

/**
 * `YYYY-MM-DD` from a `date` value. The server sends Postgres's own text
 * (lib/db/pool.ts), so the calendar day is read off directly, never through a
 * `Date`, which would shift it by the time zone.
 */
function dateOnly(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|[ T])/.exec(value.trim())
  if (match) return match[1]
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

// `2024-01-15 10:00:00.123456+05:30` as Postgres prints it, or an ISO string.
const PG_TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2}(?:\.\d+)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?(?::?\d{2})?)?$/i

/**
 * `YYYY-MM-DDTHH:mm` for a `datetime-local` input. A `timestamp` (no offset)
 * keeps its wall-clock reading; a `timestamptz` (with offset) is shown in the
 * browser's time zone.
 */
function localDateTimeMinutes(value: string): string | null {
  const match = PG_TIMESTAMP.exec(value.trim())
  let parsed: Date
  if (match) {
    const [, date, hoursMinutes, seconds = '', zone] = match
    if (!zone) return `${date}T${hoursMinutes}`
    // `+08` / `+0530` → `+08:00` / `+05:30`; an offset with seconds (pre-1900 LMT) drops them.
    const digits = zone.replace(/:/g, '')
    const isoZone = zone.toUpperCase() === 'Z' ? 'Z' : `${digits.slice(0, 3)}:${digits.slice(3, 5) || '00'}`
    parsed = new Date(`${date}T${hoursMinutes}${seconds.slice(0, 7)}${isoZone}`)
  } else {
    parsed = new Date(value)
  }
  if (Number.isNaN(parsed.getTime())) return null
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function normalizeDateValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  return dateOnly(String(value)) ?? String(value)
}

function normalizeDateTimeValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  return localDateTimeMinutes(String(value)) ?? String(value)
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
  return dateOnly(value) ?? ''
}

/** Value for an `<input type="datetime-local">` in the browser's timezone. */
export function toDateTimeInputValue(value: unknown) {
  if (typeof value !== 'string' || !value) return ''
  return localDateTimeMinutes(value) ?? ''
}
