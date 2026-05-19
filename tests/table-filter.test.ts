import { describe, expect, it } from 'vitest'
import {
  buildTableRowFilter,
  coerceFilterValue,
  defaultFilterModeForColumnKind,
  filterModeNeedsValue,
  formatTableFilterSummary,
  getFilterModeOptionsForColumnKind,
  hasActiveTableFilter,
  isFilterModeAllowedForColumnKind,
  parseFilterMode,
} from '../lib/table-filter'

describe('table-filter', () => {
  it('parses filter modes per column kind', () => {
    expect(parseFilterMode('starts_with', 'numeric')).toBe('equals')
    expect(parseFilterMode('gt', 'numeric')).toBe('gt')
    expect(parseFilterMode('contains', 'text')).toBe('contains')
  })

  it('exposes comparison operators for numeric columns only', () => {
    expect(isFilterModeAllowedForColumnKind('gt', 'numeric')).toBe(true)
    expect(isFilterModeAllowedForColumnKind('gt', 'text')).toBe(false)
    expect(getFilterModeOptionsForColumnKind('numeric').some((option) => option.value === 'gt')).toBe(true)
    expect(getFilterModeOptionsForColumnKind('text').some((option) => option.value === 'gt')).toBe(false)
  })

  it('builds typed SQL for text, numeric, boolean, and date columns', () => {
    expect(buildTableRowFilter('"title"', 'contains', 'todo', 'text')).toEqual({
      whereClause: ` where cast("title" as text) ilike $1 `,
      params: ['%todo%'],
    })
    expect(buildTableRowFilter('"amount"', 'gt', '10', 'numeric')).toEqual({
      whereClause: ` where "amount" > $1::numeric `,
      params: ['10'],
    })
    expect(buildTableRowFilter('"active"', 'equals', 'true', 'boolean')).toEqual({
      whereClause: ` where "active" = $1::boolean `,
      params: ['true'],
    })
    expect(buildTableRowFilter('"created_at"', 'gte', '2024-01-01T00:00', 'timestamp with time zone')).toEqual({
      whereClause: ` where "created_at"::timestamptz >= $1::timestamptz `,
      params: ['2024-01-01T00:00'],
    })
    expect(buildTableRowFilter('"birthday"', 'is_empty', '', 'date')).toEqual({
      whereClause: ` where "birthday" is null `,
      params: [],
    })
  })

  it('coerces filter values for typed columns', () => {
    expect(coerceFilterValue('42', 'numeric', 'equals')).toBe('42')
    expect(coerceFilterValue('abc', 'numeric', 'equals')).toBeNull()
    expect(coerceFilterValue('yes', 'boolean', 'equals')).toBe('true')
    expect(coerceFilterValue('2024-05-01', 'date', 'equals')).toBe('2024-05-01')
    expect(coerceFilterValue('bad-date', 'date', 'equals')).toBeNull()
  })

  it('detects active filters and default modes', () => {
    expect(filterModeNeedsValue('is_empty')).toBe(false)
    expect(hasActiveTableFilter('title', 'is_empty', '')).toBe(true)
    expect(hasActiveTableFilter('amount', 'gt', '   ')).toBe(false)
    expect(defaultFilterModeForColumnKind('numeric')).toBe('equals')
  })

  it('formats filter summary for toolbar label', () => {
    expect(formatTableFilterSummary('title', 'contains', 'todo')).toBe('title contains todo')
    expect(formatTableFilterSummary('amount', 'gt', '100')).toBe('amount > 100')
    expect(formatTableFilterSummary('', 'contains', 'todo')).toBeNull()
  })
})
