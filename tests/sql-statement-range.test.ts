import { describe, expect, it } from 'vitest'
import { currentStatementRange, sqlStatementRanges } from '@/lib/sql-statement-range'

describe('current statement', () => {
  it('keeps SQL function BEGIN ATOMIC bodies together', () => {
    const sql =
      'create function f() returns int language sql begin atomic select case when true then 1 else 2 end; select 3; end; select 4;'
    expect(sqlStatementRanges(sql)).toHaveLength(2)
  })
  it.each([
    "select 'it''s; ok'; select 2;",
    'select "column;name"; select 2;',
    'do $body$begin perform 1; end;$body$; select 2;',
    'select 1 /* outer /* inner; */ ; */; select 2;',
    'select 1 -- comment;\n; select 2;',
    "select E'escaped\\'; quote'; select 2;",
    "select '你好😀'; select 2;",
  ])('ignores embedded delimiters in %s', (sql) => {
    const ranges = sqlStatementRanges(sql)
    expect(ranges).toHaveLength(2)
    const range = currentStatementRange(sql, sql.indexOf('select 2'))!
    expect(sql.slice(range.start, range.end).trim()).toBe('select 2;')
  })
  it('selects the next statement after a delimiter and the last statement at EOF', () => {
    expect(currentStatementRange('select 1; select 2;', 9)).toEqual({ start: 9, end: 19 })
    expect(currentStatementRange('select 1;', 9)).toEqual({ start: 0, end: 9 })
  })
  it('does not execute comments or empty statements', () => {
    expect(sqlStatementRanges('; -- hi\n /* hi */')).toEqual([])
  })
  it('keeps incomplete SQL available for database diagnostics', () => {
    expect(sqlStatementRanges("select 'unfinished;")).toHaveLength(1)
  })
})
