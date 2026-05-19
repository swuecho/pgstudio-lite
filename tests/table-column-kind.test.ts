import { describe, expect, it } from 'vitest'
import { getColumnKind } from '../lib/table-column-kind'

describe('table-column-kind', () => {
  it('classifies postgres column types', () => {
    expect(getColumnKind('integer')).toBe('numeric')
    expect(getColumnKind('bigint')).toBe('numeric')
    expect(getColumnKind('boolean')).toBe('boolean')
    expect(getColumnKind('date')).toBe('date')
    expect(getColumnKind('timestamp with time zone')).toBe('datetime')
    expect(getColumnKind('character varying')).toBe('text')
  })
})
