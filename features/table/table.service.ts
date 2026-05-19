import { fetchJson } from '../../lib/http'
import { hasActiveTableFilter, type TableFilterMode } from '../../lib/table-filter'
import type { ColumnInfo, Connection, RowData, RowKey, TableInfo } from '../../components/table-editor/types'

export async function getConnections() {
  return fetchJson<{ connections: Connection[]; configured: boolean }>('/api/connections')
}

export async function getTables(connectionName: string) {
  return fetchJson<{ tables: TableInfo[] }>(
    `/api/tables?connectionName=${encodeURIComponent(connectionName)}`
  )
}

export async function getRows(args: {
  schema?: string
  table: string
  connectionName: string
  page: number
  pageSize: number
  sortBy: string
  sortOrder: 'asc' | 'desc'
  filterColumn: string
  filterValue: string
  filterValueEnd?: string
  filterMode: TableFilterMode
}) {
  const params = new URLSearchParams({
    connectionName: args.connectionName,
    schema: args.schema || 'public',
    limit: String(args.pageSize),
    offset: String(args.page * args.pageSize),
    sortBy: args.sortBy,
    sortOrder: args.sortOrder,
  })
  if (hasActiveTableFilter(args.filterColumn, args.filterMode, args.filterValue, args.filterValueEnd ?? '')) {
    params.set('filterColumn', args.filterColumn)
    params.set('filterMode', args.filterMode)
    if (args.filterValue.trim()) {
      params.set('filterValue', args.filterValue.trim())
    }
    if (args.filterValueEnd?.trim()) {
      params.set('filterValueEnd', args.filterValueEnd.trim())
    }
  }

  return fetchJson<{ columns: ColumnInfo[]; rows: RowData[]; total: number }>(
    `/api/tables/${encodeURIComponent(args.table)}/rows?${params.toString()}`
  )
}

export async function createRow(
  table: string,
  payload: { connectionName: string; schema?: string; values: Record<string, unknown> }
) {
  const body = { ...payload, schema: payload.schema || 'public' }
  return fetchJson<{ row: RowData }>(`/api/tables/${encodeURIComponent(table)}/rows`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function patchRow(
  table: string,
  payload: { connectionName: string; schema?: string; rowKey: RowKey; patch: Record<string, unknown> }
) {
  const body = { ...payload, schema: payload.schema || 'public' }
  return fetchJson<{ ok: boolean }>(`/api/tables/${encodeURIComponent(table)}/rows`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function removeRow(table: string, payload: { connectionName: string; schema?: string; rowKey: RowKey }) {
  const body = { ...payload, schema: payload.schema || 'public' }
  return fetchJson<{ ok: boolean }>(`/api/tables/${encodeURIComponent(table)}/rows`, {
    method: 'DELETE',
    body: JSON.stringify(body),
  })
}
