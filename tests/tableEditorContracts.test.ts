import { describe, expect, it } from 'vitest'
import {
  parseActiveTableKey,
  resolveNextActiveTable,
  resolveSortAndFilter,
  toActiveTableKey,
} from '../components/table-editor/tableEditorContracts'

describe('tableEditorContracts', () => {
  it('parses schema and table from active table key', () => {
    expect(parseActiveTableKey('public.users')).toEqual({ schema: 'public', table: 'users' })
  })

  it('keeps dotted table names intact', () => {
    expect(parseActiveTableKey('analytics.monthly.rollup')).toEqual({
      schema: 'analytics',
      table: 'monthly.rollup',
    })
  })

  it('keeps preselected table while list is loading', () => {
    const next = resolveNextActiveTable([], 'public.orders', true)
    expect(next).toBeNull()
  })

  it('clears active table when list finished loading and no tables exist', () => {
    const next = resolveNextActiveTable([], 'public.orders', false)
    expect(next).toBe('')
  })

  it('falls back to first table when selected table is missing', () => {
    const next = resolveNextActiveTable(
      [
        { schema: 'public', table: 'users', estimatedRows: 10 },
        { schema: 'public', table: 'orders', estimatedRows: 20 },
      ],
      'public.missing_table',
      false
    )
    expect(next).toBe(toActiveTableKey('public', 'users'))
  })

  it('keeps sort and filter when columns still support them', () => {
    const result = resolveSortAndFilter(
      [
        { name: 'id', dataType: 'int4', isNullable: false, isIdentity: true, isPrimaryKey: true },
        { name: 'name', dataType: 'text', isNullable: true, isIdentity: false, isPrimaryKey: false },
      ],
      'name',
      'name'
    )
    expect(result).toEqual({ nextSortBy: 'name', nextFilterColumn: 'name' })
  })

  it('resets invalid sort and filter columns', () => {
    const result = resolveSortAndFilter(
      [{ name: 'id', dataType: 'int4', isNullable: false, isIdentity: true, isPrimaryKey: true }],
      'deleted_column',
      'other_deleted_column'
    )
    expect(result).toEqual({ nextSortBy: '', nextFilterColumn: '' })
  })
})
