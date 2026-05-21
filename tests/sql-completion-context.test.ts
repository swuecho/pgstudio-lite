import { describe, expect, it } from 'vitest'
import {
  aliasByTableKey,
  buildAliasMap,
  buildMergedColumnSuggestions,
  deriveTableAlias,
  getClauseColumnContext,
  getDotCompletionContext,
  getQueryTables,
  getTextBeforeCursor,
  isFromJoinTableContext,
  resolveAvailableAlias,
  resolveTableForDotContext,
} from '../lib/sql-completion-context'

const schemaTables = [
  { schema: 'public', table: 'warehouse_skus' },
  { schema: 'public', table: 'skus' },
  { schema: 'storage', table: 'buckets' },
]

describe('deriveTableAlias', () => {
  it('uses first letter of each underscore-separated word', () => {
    expect(deriveTableAlias('warehouse_skus')).toBe('ws')
    expect(deriveTableAlias('s3_multipart_uploads')).toBe('smu')
  })

  it('uses first letter for a single-word table', () => {
    expect(deriveTableAlias('skus')).toBe('s')
  })
})

describe('resolveAvailableAlias', () => {
  it('appends a suffix when alias is already used', () => {
    expect(resolveAvailableAlias('warehouse_skus', ['ws'])).toBe('ws2')
  })
})

describe('isFromJoinTableContext', () => {
  it('matches FROM and JOIN table completion positions', () => {
    expect(isFromJoinTableContext('select * from ')).toBe(true)
    expect(isFromJoinTableContext('select * from public.')).toBe(true)
    expect(isFromJoinTableContext('from public.warehouse')).toBe(true)
    expect(isFromJoinTableContext('inner join public.')).toBe(true)
    expect(isFromJoinTableContext('innner join public.')).toBe(true)
    expect(isFromJoinTableContext('select public.')).toBe(false)
    expect(isFromJoinTableContext('where public.')).toBe(false)
  })
})

describe('getDotCompletionContext', () => {
  it('detects alias dot context', () => {
    expect(getDotCompletionContext('select * from public.skus s on s.')).toEqual({
      kind: 'alias',
      alias: 's',
      prefix: '',
    })
  })

  it('detects alias with typed prefix', () => {
    expect(getDotCompletionContext('on s.sku')).toEqual({
      kind: 'alias',
      alias: 's',
      prefix: 'sku',
    })
  })

  it('detects qualified table dot context', () => {
    expect(getDotCompletionContext('select public.skus.')).toEqual({
      kind: 'qualifiedTable',
      schema: 'public',
      table: 'skus',
      prefix: '',
    })
  })
})

describe('getTextBeforeCursor', () => {
  it('collects text from prior lines and current line', () => {
    const text = getTextBeforeCursor(
      ['select *', 'from public.skus s on s.'],
      { lineNumber: 2, column: 25 }
    )
    expect(text).toBe('select *\nfrom public.skus s on s.')
  })
})

describe('buildAliasMap', () => {
  it('maps aliases from FROM and JOIN clauses', () => {
    const sql = `select * from public.warehouse_skus ws
inner join public.skus s on ws.id = s.id`
    const map = buildAliasMap(sql, schemaTables)
    expect(map.ws).toEqual({ schema: 'public', table: 'warehouse_skus' })
    expect(map.s).toEqual({ schema: 'public', table: 'skus' })
  })

  it('resolves unqualified table names against schema list', () => {
    const sql = 'select * from skus s'
    const map = buildAliasMap(sql, schemaTables)
    expect(map.s).toEqual({ schema: 'public', table: 'skus' })
  })

  it('extracts aliases even with join keyword typos', () => {
    const sql = `select * from public.warehouse_skus ws
innner join public.skus s on s.`
    const map = buildAliasMap(sql, schemaTables)
    expect(map.s).toEqual({ schema: 'public', table: 'skus' })
    expect(map.ws).toEqual({ schema: 'public', table: 'warehouse_skus' })
  })

  it('registers implicit table-name alias when no explicit alias', () => {
    const sql = 'select * from public.skus'
    const map = buildAliasMap(sql, schemaTables)
    expect(map.skus).toEqual({ schema: 'public', table: 'skus' })
  })
})

describe('getClauseColumnContext', () => {
  it('detects WHERE clause column context', () => {
    expect(getClauseColumnContext('select * from public.skus s where ')).toEqual({
      clause: 'where',
      prefix: '',
    })
  })

  it('detects WHERE with typed prefix', () => {
    expect(getClauseColumnContext('where sk')).toEqual({
      clause: 'where',
      prefix: 'sk',
    })
  })

  it('detects AND/OR in WHERE without matching ORDER BY', () => {
    expect(getClauseColumnContext('where a = 1 and ')).toEqual({
      clause: 'where',
      prefix: '',
    })
    expect(getClauseColumnContext('where a = 1 or col')).toEqual({
      clause: 'where',
      prefix: 'col',
    })
    expect(getClauseColumnContext('order by col')).toBeNull()
  })

  it('detects SELECT list column context', () => {
    expect(getClauseColumnContext('select ')).toEqual({
      clause: 'select',
      prefix: '',
    })
    expect(getClauseColumnContext('select id, ')).toEqual({
      clause: 'select',
      prefix: '',
    })
    expect(getClauseColumnContext('select id, na')).toEqual({
      clause: 'select',
      prefix: 'na',
    })
  })

  it('ignores SELECT list after FROM', () => {
    expect(getClauseColumnContext('select * from public.skus s where ')).toEqual({
      clause: 'where',
      prefix: '',
    })
  })
})

describe('getQueryTables', () => {
  it('returns unique tables from alias map', () => {
    const sql = `select * from public.warehouse_skus ws
inner join public.skus s`
    expect(getQueryTables(sql, schemaTables)).toEqual([
      { schema: 'public', table: 'warehouse_skus' },
      { schema: 'public', table: 'skus' },
    ])
  })
})

describe('buildMergedColumnSuggestions', () => {
  it('deduplicates shared column names', () => {
    const merged = buildMergedColumnSuggestions(
      [
        {
          table: { schema: 'public', table: 'warehouse_skus' },
          alias: 'ws',
          columns: ['id', 'sku_id'],
        },
        {
          table: { schema: 'public', table: 'skus' },
          alias: 's',
          columns: ['id', 'name'],
        },
      ],
      ''
    )
    expect(merged.find((item) => item.name === 'id')?.insertText).toMatch(/\.id$/)
    expect(merged.find((item) => item.name === 'name')?.insertText).toBe('name')
    expect(merged.find((item) => item.name === 'sku_id')?.insertText).toBe('sku_id')
    expect(merged).toHaveLength(3)
  })

  it('uses alias-qualified insertText for ambiguous names', () => {
    const merged = buildMergedColumnSuggestions(
      [
        {
          table: { schema: 'public', table: 'warehouse_skus' },
          alias: 'ws',
          columns: ['id'],
        },
        {
          table: { schema: 'public', table: 'skus' },
          alias: 's',
          columns: ['id'],
        },
      ],
      ''
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].insertText).toMatch(/\.id$/)
  })
})

describe('aliasByTableKey', () => {
  it('maps table keys to first alias', () => {
    const sql = 'select * from public.skus s'
    expect(aliasByTableKey(sql, schemaTables)).toEqual({
      'public.skus': 's',
    })
  })
})

describe('resolveTableForDotContext', () => {
  it('resolves alias to table from query', () => {
    const sql = `select * from public.warehouse_skus ws
innner join public.skus s on s.`
    const dotContext = getDotCompletionContext('on s.')
    expect(dotContext).not.toBeNull()
    expect(resolveTableForDotContext(dotContext!, sql, schemaTables)).toEqual({
      schema: 'public',
      table: 'skus',
    })
  })

  it('resolves qualified table directly', () => {
    const dotContext = getDotCompletionContext('select public.skus.')
    expect(dotContext).not.toBeNull()
    expect(resolveTableForDotContext(dotContext!, '', schemaTables)).toEqual({
      schema: 'public',
      table: 'skus',
    })
  })
})
