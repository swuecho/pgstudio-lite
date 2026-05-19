import { describe, expect, it } from 'vitest'
import { sanitizeRowsQueryOptions } from '../lib/table-query-options'

const columns = [
  { name: 'id', dataType: 'integer' },
  { name: 'email', dataType: 'text' },
  { name: 'amount', dataType: 'numeric' },
]

describe('table-query-options', () => {
  it('keeps valid sort and filter columns', () => {
    expect(
      sanitizeRowsQueryOptions(columns, {
        sortBy: 'email',
        filterColumn: 'email',
        filterValue: 'a',
      })
    ).toEqual({
      sortBy: 'email',
      filterColumn: 'email',
      filterValue: 'a',
      filterValueEnd: '',
      filterMode: 'contains',
      columnDataType: 'text',
    })
  })

  it('allows is_null filter without a value', () => {
    expect(
      sanitizeRowsQueryOptions(columns, {
        filterColumn: 'email',
        filterMode: 'is_null',
        filterValue: 'ignored',
      })
    ).toEqual({
      sortBy: '',
      filterColumn: 'email',
      filterValue: '',
      filterValueEnd: '',
      filterMode: 'is_null',
      columnDataType: 'text',
    })
  })

  it('sanitizes between filter values', () => {
    expect(
      sanitizeRowsQueryOptions(columns, {
        filterColumn: 'amount',
        filterMode: 'between',
        filterValue: '10',
        filterValueEnd: '100',
      })
    ).toMatchObject({
      filterColumn: 'amount',
      filterValue: '10',
      filterValueEnd: '100',
      filterMode: 'between',
    })
  })
})
