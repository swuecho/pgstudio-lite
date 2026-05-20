import { describe, expect, it } from 'vitest'
import { compileSqlTemplate, extractTemplateKeys } from '../lib/notebook-params'

describe('notebook SQL params', () => {
  it('extracts unique template keys', () => {
    const keys = extractTemplateKeys(
      'select * from t where d >= {{start_date}} and d <= {{ end_date }} and d >= {{start_date}}'
    )
    expect(keys).toEqual(['start_date', 'end_date'])
  })

  it('compiles placeholders into parameterized SQL', () => {
    const compiled = compileSqlTemplate('select * from t where d >= {{start_date}} and n <= {{limit}}', {
      start_date: '2026-02-01',
      limit: 25,
    })

    expect(compiled.text).toBe('select * from t where d >= $1 and n <= $2')
    expect(compiled.values).toEqual(['2026-02-01', 25])
    expect(compiled.keys).toEqual(['start_date', 'limit'])
  })

  it('reuses the same positional index when placeholder repeats', () => {
    const compiled = compileSqlTemplate('select * from t where a = {{k}} or b = {{k}}', { k: 'x' })
    expect(compiled.text).toBe('select * from t where a = $1 or b = $1')
    expect(compiled.values).toEqual(['x'])
  })

  it('throws when a key is missing', () => {
    expect(() => compileSqlTemplate('select {{missing}}', {})).toThrow(
      "Missing input value for '{{missing}}'"
    )
  })
})
