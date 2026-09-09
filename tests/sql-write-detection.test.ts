import { describe, expect, it } from 'vitest'
import { containsWriteNode, isWriteStatement } from '@/lib/sql-write-detection'

describe('isWriteStatement', () => {
  it('allows plain reads', async () => {
    for (const sql of [
      'select 1',
      'select * from foo where id = 1',
      'with t as (select 1 as n) select n from t',
      'explain select * from foo',
      'explain (analyze false) insert into foo values (1)',
      'show search_path',
      'set search_path = public',
      'begin',
      'commit',
      'values (1), (2)',
      'table foo',
    ]) {
      expect(await isWriteStatement(sql), sql).toBe(false)
    }
  })

  it('rejects direct writes', async () => {
    for (const sql of [
      'insert into foo values (1)',
      'update foo set a = 1',
      'delete from foo',
      'truncate foo',
      'drop table foo',
      'alter table foo add column b int',
      'create table bar (id int)',
      'create index on foo (a)',
      'copy foo from stdin',
      'do $$ begin perform 1; end $$',
      'call proc()',
      'vacuum foo',
      'grant select on foo to bob',
      "alter system set work_mem = '1MB'",
      'discard all',
    ]) {
      expect(await isWriteStatement(sql), sql).toBe(true)
    }
  })

  it('rejects writes nested inside otherwise read-looking statements', async () => {
    for (const sql of [
      'with t as (insert into foo values (1) returning *) select * from t',
      'with a as (select 1), b as (delete from foo returning *) select * from a',
      'select * from (with t as (update foo set a = 1 returning *) select * from t) sub',
      'explain analyze insert into foo values (1)',
      'explain (analyze, buffers) delete from foo',
      'explain (analyze true) update foo set a = 1',
      'prepare p as insert into foo values (1)',
      'select * into bar from foo',
      'create table bar as select * from foo',
    ]) {
      expect(await isWriteStatement(sql), sql).toBe(true)
    }
  })

  it('flags a batch when any statement writes', async () => {
    expect(await isWriteStatement('select 1; delete from foo; select 2')).toBe(true)
    expect(await isWriteStatement('select 1; select 2')).toBe(false)
  })

  it('propagates syntax errors from the parser', async () => {
    await expect(isWriteStatement('select from where')).rejects.toThrow()
  })
})

describe('containsWriteNode', () => {
  it('ignores scalars, arrays of scalars, and unknown node types', () => {
    expect(containsWriteNode(null)).toBe(false)
    expect(containsWriteNode('InsertStmt')).toBe(false)
    expect(containsWriteNode(['InsertStmt'])).toBe(false)
    expect(containsWriteNode({ SelectStmt: { targetList: [] } })).toBe(false)
  })

  it('does not treat a string value that happens to name a write node as a write', () => {
    expect(containsWriteNode({ SelectStmt: { targetList: [{ ResTarget: { name: 'DeleteStmt' } }] } })).toBe(
      false
    )
  })
})
