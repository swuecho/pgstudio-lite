import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { queryHistory, querySnippets } from '@/drizzle/schema'
import { getMetaDb } from '../meta-db'
import { getConnectionByName } from './connections'

type QueryHistoryRow = {
  id: string
  connection_name: string
  query_text: string
  status: 'success' | 'error'
  duration_ms: number
  row_count: number | null
  error_text: string | null
  executed_at: string
  started_at: string
  metadata_json?: string | null
}

type QuerySnippetRow = {
  id: string
  title: string
  query_text: string
  connection_name: string
  created_at: string
  updated_at: string
}

function parseHistoryRow(row: QueryHistoryRow) {
  return {
    ...row,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
    metadata_json: undefined,
  }
}

function toHistoryRow(row: typeof queryHistory.$inferSelect): QueryHistoryRow {
  return {
    id: row.id,
    connection_name: row.connectionName,
    query_text: row.queryText,
    status: row.status as 'success' | 'error',
    duration_ms: row.durationMs,
    row_count: row.rowCount,
    error_text: row.errorText,
    executed_at: row.executedAt,
    started_at: row.startedAt,
    metadata_json: row.metadataJson,
  }
}

function toSnippetRow(row: typeof querySnippets.$inferSelect): QuerySnippetRow {
  return {
    id: row.id,
    title: row.title,
    query_text: row.queryText,
    connection_name: row.connectionName,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

export function getHistory(limit = 100, connectionName?: string) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100))
  const resolved = connectionName?.trim()
  const rows = resolved
    ? getMetaDb()
        .select()
        .from(queryHistory)
        .where(eq(queryHistory.connectionName, resolved))
        .orderBy(desc(queryHistory.executedAt))
        .limit(safeLimit)
        .all()
    : getMetaDb().select().from(queryHistory).orderBy(desc(queryHistory.executedAt)).limit(safeLimit).all()
  return rows.map((row) => parseHistoryRow(toHistoryRow(row)))
}

export function clearHistory(connectionName?: string) {
  const resolved = connectionName?.trim()
  if (!resolved) {
    getMetaDb().delete(queryHistory).run()
    return
  }
  getMetaDb().delete(queryHistory).where(eq(queryHistory.connectionName, resolved)).run()
}

export function getSnippets(limit = 100, connectionName?: string) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100))
  const resolvedConnectionName = getConnectionByName(connectionName).name
  return getMetaDb()
    .select()
    .from(querySnippets)
    .where(eq(querySnippets.connectionName, resolvedConnectionName))
    .orderBy(desc(querySnippets.updatedAt))
    .limit(safeLimit)
    .all()
    .map(toSnippetRow)
}

export function saveSnippet({
  title,
  queryText,
  connectionName,
}: {
  title: string
  queryText: string
  connectionName?: string
}) {
  const now = new Date().toISOString()
  const id = randomUUID()
  const resolvedConnectionName = getConnectionByName(connectionName).name
  getMetaDb()
    .insert(querySnippets)
    .values({
      id,
      title: title.trim(),
      queryText: queryText.trim(),
      connectionName: resolvedConnectionName,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  return {
    id,
    title: title.trim(),
    query_text: queryText.trim(),
    connection_name: resolvedConnectionName,
    created_at: now,
    updated_at: now,
  }
}

export function updateSnippet({
  id,
  title,
  queryText,
  connectionName,
}: {
  id: string
  title?: string
  queryText?: string
  connectionName?: string
}) {
  const resolvedConnectionName = getConnectionByName(connectionName).name
  if (title === undefined && queryText === undefined) {
    const row = getMetaDb()
      .select()
      .from(querySnippets)
      .where(and(eq(querySnippets.id, id), eq(querySnippets.connectionName, resolvedConnectionName)))
      .get()
    return row ? toSnippetRow(row) : null
  }

  const values: Partial<typeof querySnippets.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  }
  if (title !== undefined) values.title = title.trim()
  if (queryText !== undefined) values.queryText = queryText.trim()

  const result = getMetaDb()
    .update(querySnippets)
    .set(values)
    .where(and(eq(querySnippets.id, id), eq(querySnippets.connectionName, resolvedConnectionName)))
    .run()
  if (!result.changes) return null

  const row = getMetaDb()
    .select()
    .from(querySnippets)
    .where(and(eq(querySnippets.id, id), eq(querySnippets.connectionName, resolvedConnectionName)))
    .get()
  return row ? toSnippetRow(row) : null
}

export function deleteSnippet(id: string, connectionName?: string) {
  const resolvedConnectionName = getConnectionByName(connectionName).name
  getMetaDb()
    .delete(querySnippets)
    .where(and(eq(querySnippets.id, id), eq(querySnippets.connectionName, resolvedConnectionName)))
    .run()
}
