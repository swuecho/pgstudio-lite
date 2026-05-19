import { describe, expect, it } from 'vitest'
import {
  buildTableRowFilter,
  coerceFilterValue,
  defaultFilterModeForColumnKind,
  filterModeNeedsEndValue,
  filterModeNeedsValue,
  formatTableFilterSummary,
  getFilterModeOptionsForColumnKind,
  hasActiveTableFilter,
  isFilterModeAllowedForColumnKind,
  isSlowFilterMode,
  parseFilterMode,
} from '../lib/table-filter'

describe('table-filter', () => {
  it('parses filter modes per column kind', () => {
    expect(parseFilterMode('starts_with', 'numeric')).toBe('equals')
    expect(parseFilterMode('gt', 'numeric')).toBe('gt')
    expect(parseFilterMode('is_null', 'text')).toBe('is_null')
  })

  it('exposes comparison and null operators by kind', () => {
    expect(isFilterModeAllowedForColumnKind('between', 'numeric')).toBe(true)
    expect(isFilterModeAllowedForColumnKind('between', 'text')).toBe(false)
    expect(getFilterModeOptionsForColumnKind('uuid').some((option) => option.value === 'equals')).toBe(true)
  })

  it('builds typed SQL including between and is_null', () => {
    expect(buildTableRowFilter('"amount"', 'between', '10', 'numeric', '100')).toEqual({
      whereClause: ' where "amount" >= $1::numeric and "amount" <= $2::numeric ',
      params: ['10', '100'],
    })
    expect(buildTableRowFilter('"title"', 'is_null', '', 'text')).toEqual({
      whereClause: ' where "title" is null ',
      params: [],
    })
    expect(buildTableRowFilter('"title"', 'is_empty', '', 'text')).toEqual({
      whereClause: ` where coalesce(cast("title" as text), '') = '' `,
      params: [],
    })
  })

  it('coerces filter values and formats summaries', () => {
    expect(coerceFilterValue('42', 'numeric', 'equals')).toBe('42')
    expect(coerceFilterValue('bad', 'numeric', 'equals')).toBeNull()
    expect(formatTableFilterSummary('amount', 'between', '1', '10')).toBe('amount between 1 and 10')
    expect(isSlowFilterMode('contains')).toBe(true)
    expect(filterModeNeedsEndValue('between')).toBe(true)
    expect(filterModeNeedsValue('is_null')).toBe(false)
    expect(hasActiveTableFilter('id', 'is_null', '', '')).toBe(true)
    expect(defaultFilterModeForColumnKind('json')).toBe('contains')
  })
})
