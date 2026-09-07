import { describe, expect, it } from 'vitest'
import { splitStatements } from '../lib/db'
import { parseSql } from '../lib/pg-parser'

describe('splitStatements', () => {
  it('splits a single statement without trailing semicolon', async () => {
    expect(await splitStatements('select 1')).toEqual(['select 1'])
  })

  it('splits a single statement with trailing semicolon', async () => {
    expect(await splitStatements('select 1;')).toEqual(['select 1'])
  })

  it('splits two simple statements', async () => {
    expect(await splitStatements('select 1; select 2')).toEqual(['select 1', 'select 2'])
  })

  it('splits multiple statements with semicolons', async () => {
    expect(await splitStatements('select 1; select 2; select 3;')).toEqual([
      'select 1',
      'select 2',
      'select 3',
    ])
  })

  it('returns empty array for empty input', async () => {
    expect(await splitStatements('')).toEqual([])
  })

  it('returns empty array for whitespace-only input', async () => {
    expect(await splitStatements('   \n\t   ')).toEqual([])
  })

  it('returns empty array for only semicolons', async () => {
    expect(await splitStatements(';;;')).toEqual([])
  })

  it('ignores leading semicolon', async () => {
    expect(await splitStatements('; select 1')).toEqual(['select 1'])
  })

  it('handles trailing semicolon', async () => {
    expect(await splitStatements('select 1; ')).toEqual(['select 1'])
  })

  it('preserves semicolon inside single-quoted string', async () => {
    expect(await splitStatements("select 'hello;world'")).toEqual(["select 'hello;world'"])
  })

  it('preserves semicolon inside double-quoted identifier', async () => {
    expect(await splitStatements('select "col;name" from t')).toEqual(['select "col;name" from t'])
  })

  it('handles escaped quotes inside strings', async () => {
    expect(await splitStatements("select 'it''s fine;yes'")).toEqual(["select 'it''s fine;yes'"])
  })

  it('preserves semicolon inside dollar-quoted string ($$)', async () => {
    expect(await splitStatements('select $$hello;world$$')).toEqual(['select $$hello;world$$'])
  })

  it('preserves semicolon inside named dollar-quoted string', async () => {
    expect(await splitStatements('select $body$begin; end;$body$')).toEqual([
      'select $body$begin; end;$body$',
    ])
  })

  it('handles multiple statements with dollar-quoted strings', async () => {
    const sql = `select $$a;b$$;
select 2;`
    expect(await splitStatements(sql)).toEqual(['select $$a;b$$', 'select 2'])
  })

  it('preserves semicolons inside function body in DO block', async () => {
    const sql = `do $$
begin
  create table t(id int);
  insert into t values (1);
end;
$$;`
    const result = await splitStatements(sql)
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('create table t(id int);')
    expect(result[0]).toContain('insert into t values (1);')
  })

  it('preserves semicolons inside line comments', async () => {
    expect(await splitStatements('select 1 -- comment; still comment\n; select 2')).toEqual([
      'select 1 -- comment; still comment',
      'select 2',
    ])
  })

  it('preserves semicolons inside block comments', async () => {
    expect(await splitStatements('select 1 /* comment; still comment */; select 2')).toEqual([
      'select 1 /* comment; still comment */',
      'select 2',
    ])
  })

  it('handles nested block comments', async () => {
    expect(await splitStatements('select /* outer /* inner */ still; comment */ 1; select 2')).toEqual([
      'select /* outer /* inner */ still; comment */ 1',
      'select 2',
    ])
  })

  it('handles multiline statements', async () => {
    const sql = `select
  a,
  b
from t;
select 2;`
    expect(await splitStatements(sql)).toEqual(['select\n  a,\n  b\nfrom t', 'select 2'])
  })

  it('handles a realistic CREATE FUNCTION with dollar quoting', async () => {
    const sql = `create or replace function add(a int, b int) returns int as $$
begin
  return a + b;
end;
$$ language plpgsql;
select add(1, 2);`
    const result = await splitStatements(sql)
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('create or replace function')
    expect(result[0]).toContain('return a + b;')
    expect(result[1]).toBe('select add(1, 2)')
  })

  it('handles a realistic multi-statement migration script', async () => {
    const sql = `-- migration v1
create table users (
  id serial primary key,
  name text not null
);

create table posts (
  id serial primary key,
  user_id int references users(id),
  body text
);

-- seed data
insert into users (name) values ('alice');`
    const result = await splitStatements(sql)
    expect(result).toHaveLength(3)
    expect(result[0]).toContain('create table users')
    expect(result[1]).toContain('create table posts')
    expect(result[2]).toContain('insert into users (name) values')
    expect(result[2]).toContain('-- seed data')
  })

  it('handles semicolons inside dollar quotes with mixed cases', async () => {
    const sql = `select $tag$hello;$tag$, 'world;'; select 2;`
    const result = await splitStatements(sql)
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('$tag$hello;$tag$')
    expect(result[1]).toBe('select 2')
  })

  it('handles empty statements between semicolons in the middle', async () => {
    expect(await splitStatements('select 1; ; select 2')).toEqual(['select 1', 'select 2'])
  })

  it('handles semicolons inside nested dollar quotes', async () => {
    // Note: PostgreSQL does not truly nest dollar quotes, but different tags
    // can appear inside each other
    const sql = `select $outer$inner;$inner$still;$outer$; select 2;`
    const result = await splitStatements(sql)
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('$outer$')
    expect(result[1]).toBe('select 2')
  })

  it('handles a single statement with no semicolons anywhere', async () => {
    expect(await splitStatements('select 1')).toEqual(['select 1'])
  })

  it('keeps CTE warehouse query as one statement', async () => {
    const sql = `with warehouse_sku_total as (
select warehouse_id , sum(jikeyun_current_quantity ) as current_quantity from public.warehouse_skus 
group by warehouse_id )
select w.jikeyun_warehouse_name , wst.current_quantity 	from warehouse_sku_total wst 
inner join public.warehouses w on wst.warehouse_id = w.id`
    expect(await splitStatements(sql)).toHaveLength(1)
    expect(await splitStatements(sql)).toEqual([sql])
    const parsed = await parseSql(sql)
    expect(parsed.stmts).toHaveLength(1)
  })

  it('handles statements with Unicode characters', async () => {
    expect(await splitStatements("select 'こんにちは;世界'")).toEqual(["select 'こんにちは;世界'"])
  })
})

it('splits Unicode SQL using PostgreSQL byte offsets', async () => {
  expect(await splitStatements("select '你好😀'; select '世界'; select 3;")).toEqual([
    "select '你好😀'",
    "select '世界'",
    'select 3',
  ])
})

it('preserves parser error position including leading whitespace', async () => {
  await expect(splitStatements('  selec 1')).rejects.toMatchObject({ position: '3' })
})
