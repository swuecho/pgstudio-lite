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
      filterMode: 'contains',
      columnDataType: 'text',
    })
  })

  it('allows is_empty filter without a value', () => {
    expect(
      sanitizeRowsQueryOptions(columns, {
        filterColumn: 'email',
        filterMode: 'is_empty',
        filterValue: 'ignored',
      })
    ).toEqual({
      sortBy: '',
      filterColumn: 'email',
      filterValue: '',
      filterMode: 'is_empty',
      columnDataType: 'text',
    })
  })

  it('rejects invalid numeric filter values', () => {
    expect(
      sanitizeRowsQueryOptions(columns, {
        filterColumn: 'amount',
        filterMode: 'gt',
        filterValue: 'not-a-number',
      })
    ).toEqual({
      sortBy: '',
      filterColumn: 'amount',
      filterValue: '',
      filterMode: 'gt',
      columnDataType: 'numeric',
    })
  })

  it('normalizes numeric filter mode for text columns', () => {
    expect(
      sanitizeRowsQueryOptions(columns, {
        filterColumn: 'email',
        filterMode: 'gt',
        filterValue: '10',
      })
    ).toEqual({
      sortBy: '',
      filterColumn: 'email',
      filterValue: '10',
      filterMode: 'contains',
      columnDataType: 'text',
    })
  })
})
