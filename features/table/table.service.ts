import { fetchJson } from '../../lib/http'
import { hasActiveTableFilter, type TableFilterMode } from '../../lib/table-filter'
import type {
  TableEditorBookmark,
  TableEditorRecentView,
  TableEditorViewState,
} from '../../lib/table-editor-views'
import type { ColumnInfo, Connection, RowData, RowKey, TableInfo } from '../../components/table-editor/types'

export type TableEditorViewsResponse = {
  bookmarks: TableEditorBookmark[]
  recentViews: TableEditorRecentView[]
}

export async function getConnections() {
  return fetchJson<{ connections: Connection[]; configured: boolean }>('/api/connections')
}

export async function getTables(connectionName: string) {
  return fetchJson<{ tables: TableInfo[]; truncated: boolean }>(
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

export async function lookupReferencedRow(args: {
  connectionName: string
  schema?: string
  table: string
  match: Record<string, unknown>
}) {
  const body = {
    connectionName: args.connectionName,
    schema: args.schema || 'public',
    match: args.match,
  }
  return fetchJson<{ row: Record<string, unknown> | null; columns: ColumnInfo[] }>(
    `/api/tables/${encodeURIComponent(args.table)}/lookup-row`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  )
}

export async function removeRow(
  table: string,
  payload: { connectionName: string; schema?: string; rowKey: RowKey }
) {
  const body = { ...payload, schema: payload.schema || 'public' }
  return fetchJson<{ ok: boolean }>(`/api/tables/${encodeURIComponent(table)}/rows`, {
    method: 'DELETE',
    body: JSON.stringify(body),
  })
}

export async function saveTableEditorViewBookmark(args: {
  connectionName: string
  title: string
  activeTable: string
  filter?: TableEditorViewState['filter']
}) {
  return fetchJson<{ item: TableEditorBookmark }>('/api/table-editor-views', {
    method: 'POST',
    body: JSON.stringify(args),
  })
}

export async function updateTableEditorViewBookmark(args: {
  connectionName: string
  id: string
  title?: string
  pinned?: boolean
}) {
  return fetchJson<{ item: TableEditorBookmark }>('/api/table-editor-views', {
    method: 'PATCH',
    body: JSON.stringify(args),
  })
}

export async function deleteTableEditorViewBookmark(id: string, connectionName: string) {
  return fetchJson<{ ok: boolean }>('/api/table-editor-views', {
    method: 'DELETE',
    body: JSON.stringify({ id, connectionName }),
  })
}

export async function getTableEditorViews(connectionName: string) {
  return fetchJson<TableEditorViewsResponse>(
    `/api/table-editor-views?connectionName=${encodeURIComponent(connectionName)}`
  )
}

export async function recordTableEditorViewRecent(args: {
  connectionName: string
  activeTable: string
  filter?: TableEditorViewState['filter']
}) {
  return fetchJson<{ item: TableEditorRecentView | null }>('/api/table-editor-views', {
    method: 'POST',
    body: JSON.stringify({ action: 'recordRecent', ...args }),
  })
}

export async function importTableEditorViewsFromLocalStorage(payload: {
  bookmarksByConnection: Record<string, TableEditorBookmark[]>
  recentViewsByConnection: Record<string, TableEditorRecentView[]>
}) {
  return fetchJson<{ ok: boolean }>('/api/table-editor-views', {
    method: 'POST',
    body: JSON.stringify({ action: 'import', ...payload }),
  })
}

export async function clearTableEditorViewRecent(connectionName: string) {
  return fetchJson<{ ok: boolean }>('/api/table-editor-views', {
    method: 'DELETE',
    body: JSON.stringify({ action: 'clearRecent', connectionName }),
  })
}
