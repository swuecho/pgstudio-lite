import { describe, expect, it } from 'vitest'
import {
  formatJsonbPreview,
  formatRowKey,
  getEditorKind,
  normalizeValueForComparison,
  previewValue,
  toDateInputValue,
  toDateTimeInputValue,
  truncate,
} from '../components/table-editor/gridCellValues'

describe('gridCellValues', () => {
  it('formats row keys and falls back when missing', () => {
    expect(formatRowKey({ id: 1 })).toBe('{"id":1}')
    expect(formatRowKey(null)).toBe('Unavailable')
  })

  it('pretty-prints jsonb values and passes non-JSON strings through', () => {
    expect(formatJsonbPreview('{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(formatJsonbPreview({ a: [1] })).toBe('{\n  "a": [\n    1\n  ]\n}')
    expect(formatJsonbPreview('not json')).toBe('not json')
    expect(formatJsonbPreview(null)).toBe('null')
  })

  it('previews and truncates values for dialogs', () => {
    expect(previewValue(null)).toBe('null')
    expect(previewValue(undefined)).toBe('undefined')
    expect(previewValue({ a: 1 })).toBe('{"a":1}')
    expect(truncate('x'.repeat(10), 4)).toBe('xxxx...')
    expect(truncate('short')).toBe('short')
  })

  it('maps column data types to editor kinds', () => {
    expect(getEditorKind('boolean')).toBe('bool')
    expect(getEditorKind('date')).toBe('date')
    expect(getEditorKind('timestamp with time zone')).toBe('datetime')
    expect(getEditorKind('jsonb')).toBe('json')
    expect(getEditorKind('text')).toBeNull()
  })

  it('treats equivalent spellings of a value as unchanged', () => {
    expect(normalizeValueForComparison('{"a": 1}', 'jsonb')).toBe(
      normalizeValueForComparison({ a: 1 }, 'jsonb')
    )
    expect(normalizeValueForComparison('2026-03-01', 'date')).toBe(
      normalizeValueForComparison('2026-03-01T00:00:00.000Z', 'date')
    )
    expect(normalizeValueForComparison('true', 'boolean')).toBe(false)
    expect(normalizeValueForComparison(true, 'boolean')).toBe(true)
    expect(normalizeValueForComparison(null, 'text')).toBe('')
    expect(normalizeValueForComparison(42, 'integer')).toBe('42')
  })

  it('converts stored dates to date-input values', () => {
    expect(toDateInputValue('2026-03-01T12:34:56.000Z')).toBe('2026-03-01')
    expect(toDateInputValue('2024-01-15')).toBe('2024-01-15')
    expect(toDateInputValue('nope')).toBe('')
    expect(toDateInputValue(null)).toBe('')
  })
})

describe('Postgres date/time text', () => {
  it('reads the calendar day of a date without a time-zone shift', () => {
    expect(toDateInputValue('2024-01-01')).toBe('2024-01-01')
    expect(normalizeValueForComparison('2024-01-01', 'date')).toBe('2024-01-01')
  })

  it('keeps the wall-clock reading of a timestamp without time zone', () => {
    expect(toDateTimeInputValue('2024-01-15 10:30:00')).toBe('2024-01-15T10:30')
    expect(toDateTimeInputValue('2024-01-15 10:30:59.123456')).toBe('2024-01-15T10:30')
    expect(normalizeValueForComparison('2024-01-15 10:30:00', 'timestamp without time zone')).toBe(
      '2024-01-15T10:30'
    )
  })

  it('shows a timestamptz in the browser time zone, whatever offset Postgres printed', () => {
    const expected = toDateTimeInputValue('2024-01-15T02:30:00.000Z')
    for (const text of ['2024-01-15 10:30:00+08', '2024-01-15 08:00:00.5+05:30', '2024-01-15 02:30:00+00']) {
      expect(toDateTimeInputValue(text), text).toBe(expected)
    }
  })

  it('returns nothing for values an input cannot show', () => {
    expect(toDateTimeInputValue('infinity')).toBe('')
    expect(toDateInputValue('-infinity')).toBe('')
  })
})
