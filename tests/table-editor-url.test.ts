import { describe, expect, it } from 'vitest'
import {
  buildTableEditorHref,
  buildTableEditorUrlQuery,
  parseTableEditorUrlQuery,
  tableEditorUrlMatches,
} from '../lib/table-editor-url'

describe('table-editor-url', () => {
  it('parses table and filter from query', () => {
    expect(
      parseTableEditorUrlQuery({
        connectionName: 'default',
        schema: 'public',
        table: 'users',
        filterColumn: 'id',
        filterValue: '42',
        filterMode: 'equals',
      })
    ).toEqual({
      connectionName: 'default',
      activeTable: 'public.users',
      filter: {
        filterColumn: 'id',
        filterMode: 'equals',
        filterValue: '42',
        filterValueEnd: '',
      },
    })
  })

  it('builds href for foreign-key navigation', () => {
    expect(
      buildTableEditorHref({
        connectionName: 'default',
        schema: 'public',
        table: 'users',
        filter: {
          filterColumn: 'id',
          filterValue: '42',
          filterMode: 'equals',
          filterValueEnd: '',
        },
      })
    ).toEqual({
      pathname: '/table-editor',
      query: {
        connectionName: 'default',
        schema: 'public',
        table: 'users',
        filterColumn: 'id',
        filterValue: '42',
        filterMode: 'equals',
      },
    })
  })

  it('detects when url already matches editor state', () => {
    const query = buildTableEditorUrlQuery({
      connectionName: 'default',
      activeTable: 'public.users',
      filterColumn: 'id',
      filterMode: 'equals',
      filterValue: '42',
      filterValueEnd: '',
    })

    expect(
      tableEditorUrlMatches(query, {
        connectionName: 'default',
        activeTable: 'public.users',
        filterColumn: 'id',
        filterMode: 'equals',
        filterValue: '42',
        filterValueEnd: '',
      })
    ).toBe(true)
  })
})
