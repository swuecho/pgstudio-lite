import { describe, expect, it } from 'vitest'
import { buildExplainQuery, formatExplainPlan } from '../components/sql-editor/utils'

describe('sql editor utils', () => {
  it('builds explain query with analyze for writable connections', () => {
    expect(buildExplainQuery('select 1', false)).toBe('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) select 1')
  })

  it('builds explain query without analyze for read-only connections', () => {
    expect(buildExplainQuery('select 1;', true)).toBe('EXPLAIN (FORMAT JSON) select 1')
  })

  it('formats explain plan json', () => {
    const formatted = formatExplainPlan('[{"Plan":{"Node Type":"Seq Scan"}}]')
    expect(formatted).toContain('Seq Scan')
  })
})
