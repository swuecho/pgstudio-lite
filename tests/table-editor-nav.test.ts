import { describe, expect, it } from 'vitest'
import {
  filterTables,
  formatCompactRowCount,
  formatRowCountLabel,
  groupTablesByKind,
  parseTableSearchQuery,
  partitionPinnedRecent,
  sortTables,
  toTableKey,
} from '../lib/table-editor-nav'
import type { TableInfo } from '../components/table-editor/types'

const sampleTables: TableInfo[] = [
  { schema: 'public', table: 'users', estimatedRows: 1200, kind: 'table' },
  { schema: 'public', table: 'orders_mv', estimatedRows: 50_000, kind: 'materialized_view' },
  { schema: 'analytics', table: 'summary', estimatedRows: 10, kind: 'view' },
]

describe('table-editor-nav', () => {
  it('parses kind-specific search prefixes', () => {
    expect(parseTableSearchQuery('mv:orders')).toEqual({
      text: 'orders',
      kindFilter: 'materialized_view',
    })
    expect(parseTableSearchQuery('view:sum')).toEqual({ text: 'sum', kindFilter: 'view' })
    expect(parseTableSearchQuery('table:users')).toEqual({ text: 'users', kindFilter: 'table' })
  })

  it('formats compact row counts', () => {
    expect(formatCompactRowCount(840)).toBe('840')
    expect(formatCompactRowCount(25840)).toBe('25.8k')
    expect(formatCompactRowCount(1_200_000)).toBe('1.2M')
    expect(formatRowCountLabel(25840)).toBe('~25.8k rows')
  })

  it('filters within schema by default and across schemas when searching', () => {
    const search = parseTableSearchQuery('sum')
    const inSchema = filterTables(sampleTables, {
      schema: 'public',
      search,
      searchAllSchemas: false,
    })
    expect(inSchema).toHaveLength(0)

    const allSchemas = filterTables(sampleTables, {
      schema: 'public',
      search,
      searchAllSchemas: true,
    })
    expect(allSchemas.map((t) => t.table)).toEqual(['summary'])
  })

  it('sorts by size descending', () => {
    const sorted = sortTables(sampleTables, 'size')
    expect(sorted.map((t) => t.table)).toEqual(['orders_mv', 'users', 'summary'])
  })

  it('groups tables by relation kind', () => {
    const groups = groupTablesByKind(sampleTables)
    expect(groups.map((g) => g.id)).toEqual(['table', 'view', 'materialized_view'])
  })

  it('partitions pinned and recent without duplicates', () => {
    const usersKey = toTableKey('public', 'users')
    const ordersKey = toTableKey('public', 'orders_mv')
    const result = partitionPinnedRecent(sampleTables, [ordersKey], [usersKey, ordersKey], usersKey)
    expect(result.pinned.map((t) => t.table)).toEqual(['orders_mv'])
    expect(result.recent).toHaveLength(0)
    expect(result.rest.map((t) => t.table)).toEqual(['users', 'summary'])
  })
})
