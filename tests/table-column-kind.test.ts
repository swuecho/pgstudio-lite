import { describe, expect, it } from 'vitest'
import {
  getColumnKind,
  isBooleanColumn,
  isDateColumn,
  isJsonColumn,
  isNumericColumn,
} from '../lib/table-column-kind'

describe('table-column-kind', () => {
  it('classifies postgres column types', () => {
    expect(getColumnKind('integer')).toBe('numeric')
    expect(getColumnKind('uuid')).toBe('uuid')
    expect(getColumnKind('jsonb')).toBe('json')
    expect(getColumnKind('boolean')).toBe('boolean')
    expect(getColumnKind('timestamp with time zone')).toBe('datetime')
    expect(getColumnKind('character varying')).toBe('text')
  })

  it('exposes shared column helpers', () => {
    expect(isNumericColumn('bigint')).toBe(true)
    expect(isBooleanColumn('boolean')).toBe(true)
    expect(isDateColumn('date')).toBe(true)
    expect(isJsonColumn('json')).toBe(true)
  })
})
