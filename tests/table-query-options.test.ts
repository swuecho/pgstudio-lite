import { describe, expect, it } from 'vitest'
import { sanitizeRowsQueryOptions } from '../lib/table-query-options'

describe('table-query-options', () => {
  it('keeps valid sort and filter columns', () => {
    expect(
      sanitizeRowsQueryOptions(['id', 'email'], {
        sortBy: 'email',
        filterColumn: 'email',
        filterValue: 'a',
      })
    ).toEqual({ sortBy: 'email', filterColumn: 'email', filterValue: 'a' })
  })
})
