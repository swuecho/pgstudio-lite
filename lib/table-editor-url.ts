import type { ParsedUrlQuery } from 'querystring'
import { getColumnKind } from './table-column-kind'
import { parseFilterMode, type TableFilterMode } from './table-filter'
import { parseActiveTableKey } from '../components/table-editor/tableEditorContracts'
import type { TableEditorFilter } from '../components/table-editor/stores/tableEditorFilterStore'

export function takeFirstQueryParam(value: string | string[] | undefined): string {
  if (!value) return ''
  return Array.isArray(value) ? value[0] || '' : value
}

export type TableEditorUrlState = {
  connectionName: string
  activeTable: string
  filter?: TableEditorFilter
}

export function parseTableEditorUrlQuery(query: ParsedUrlQuery): TableEditorUrlState {
  const connectionName = takeFirstQueryParam(query.connectionName)
  const schema = takeFirstQueryParam(query.schema) || 'public'
  const table = takeFirstQueryParam(query.table)
  const activeTable = table ? `${schema}.${table}` : ''
  const filterColumn = takeFirstQueryParam(query.filterColumn)

  if (!activeTable || !filterColumn) {
    return { connectionName, activeTable }
  }

  const filterModeRaw = takeFirstQueryParam(query.filterMode)
  return {
    connectionName,
    activeTable,
    filter: {
      filterColumn,
      filterMode: filterModeRaw ? parseFilterMode(filterModeRaw, getColumnKind('text')) : 'equals',
      filterValue: takeFirstQueryParam(query.filterValue),
      filterValueEnd: takeFirstQueryParam(query.filterValueEnd),
    },
  }
}

export function buildTableEditorUrlQuery(args: {
  connectionName: string
  activeTable: string
  filterColumn: string
  filterMode: TableFilterMode
  filterValue: string
  filterValueEnd: string
}): Record<string, string> {
  const { schema, table } = parseActiveTableKey(args.activeTable)
  const query: Record<string, string> = {}

  if (args.connectionName) query.connectionName = args.connectionName
  if (table) {
    query.schema = schema
    query.table = table
  }
  if (args.filterColumn) {
    query.filterColumn = args.filterColumn
    query.filterMode = args.filterMode
    const value = args.filterValue.trim()
    const valueEnd = args.filterValueEnd.trim()
    if (value) query.filterValue = value
    if (valueEnd) query.filterValueEnd = valueEnd
  }

  return query
}

export function buildTableEditorHref(args: {
  connectionName: string
  schema: string
  table: string
  filter?: TableEditorFilter
}) {
  const activeTable = `${args.schema}.${args.table}`
  return {
    pathname: '/table-editor',
    query: buildTableEditorUrlQuery({
      connectionName: args.connectionName,
      activeTable,
      filterColumn: args.filter?.filterColumn ?? '',
      filterMode: args.filter?.filterMode ?? 'equals',
      filterValue: args.filter?.filterValue ?? '',
      filterValueEnd: args.filter?.filterValueEnd ?? '',
    }),
  }
}

export function tableEditorUrlMatches(
  query: ParsedUrlQuery,
  state: {
    connectionName: string
    activeTable: string
    filterColumn: string
    filterMode: TableFilterMode
    filterValue: string
    filterValueEnd: string
  }
) {
  const { schema, table } = parseActiveTableKey(state.activeTable)
  const nextQuery = buildTableEditorUrlQuery({
    connectionName: state.connectionName,
    activeTable: state.activeTable,
    filterColumn: state.filterColumn,
    filterMode: state.filterColumn ? state.filterMode : 'contains',
    filterValue: state.filterValue,
    filterValueEnd: state.filterValueEnd,
  })

  return (
    takeFirstQueryParam(query.connectionName) === (nextQuery.connectionName ?? '') &&
    takeFirstQueryParam(query.schema) === (table ? schema : '') &&
    takeFirstQueryParam(query.table) === (table ?? '') &&
    takeFirstQueryParam(query.filterColumn) === (nextQuery.filterColumn ?? '') &&
    takeFirstQueryParam(query.filterValue) === (nextQuery.filterValue ?? '') &&
    takeFirstQueryParam(query.filterValueEnd) === (nextQuery.filterValueEnd ?? '') &&
    takeFirstQueryParam(query.filterMode) === (nextQuery.filterMode ?? '')
  )
}
