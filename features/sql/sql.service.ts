import { fetchJson } from '@/lib/http'
import type {
  Connection,
  HistoryItem,
  QueryResult,
  SchemaTable,
  SnippetItem,
} from '@/components/sql-editor/types'

export async function getConnections() {
  return fetchJson<{ connections: Connection[]; configured: boolean }>('/api/connections')
}

export async function runQuery(connectionName: string, query: string, rowLimit?: number) {
  return fetchJson<QueryResult>('/api/query', {
    method: 'POST',
    body: JSON.stringify({ connectionName, query, rowLimit }),
  })
}

export async function getHistory(limit = 300, connectionName?: string) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (connectionName) params.set('connectionName', connectionName)
  return fetchJson<{ items: HistoryItem[] }>(`/api/history?${params.toString()}`)
}

export async function clearHistory(connectionName?: string) {
  const params = new URLSearchParams()
  if (connectionName) params.set('connectionName', connectionName)
  const suffix = params.toString()
  return fetchJson<{ ok: boolean }>(`/api/history${suffix ? `?${suffix}` : ''}`, { method: 'DELETE' })
}

export async function getSnippets(limit = 300, connectionName?: string) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (connectionName) params.set('connectionName', connectionName)
  return fetchJson<{ items: SnippetItem[] }>(`/api/snippets?${params.toString()}`)
}

export async function createSnippet(title: string, queryText: string, connectionName: string) {
  return fetchJson<{ item: SnippetItem }>('/api/snippets', {
    method: 'POST',
    body: JSON.stringify({ title, queryText, connectionName }),
  })
}

export async function updateSnippet(
  id: string,
  payload: { title?: string; queryText?: string },
  connectionName: string
) {
  return fetchJson<{ item: SnippetItem }>('/api/snippets', {
    method: 'PATCH',
    body: JSON.stringify({ id, connectionName, ...payload }),
  })
}

export async function deleteSnippet(id: string, connectionName: string) {
  return fetchJson<{ ok: boolean }>('/api/snippets', {
    method: 'DELETE',
    body: JSON.stringify({ id, connectionName }),
  })
}

export async function getSchema(connectionName: string) {
  return fetchJson<{ tables: SchemaTable[] }>(
    `/api/schema?connectionName=${encodeURIComponent(connectionName)}`
  )
}

export async function getSchemaColumns(connectionName: string, schema: string, table: string) {
  return fetchJson<{ columns: Array<{ name: string }> }>(
    `/api/schema/columns?connectionName=${encodeURIComponent(connectionName)}&schema=${encodeURIComponent(
      schema
    )}&table=${encodeURIComponent(table)}`
  )
}
