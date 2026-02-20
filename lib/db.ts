import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import pg from 'pg'

const { Pool } = pg

type DbConnection = {
  id: string
  name: string
  connectionString: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

type DbConnectionRow = {
  id: string
  name: string
  connection_string: string
  is_default: number
  created_at: string
  updated_at: string
}

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
  created_at: string
  updated_at: string
}

export type TableInfo = {
  table: string
  schema: string
  estimatedRows: number
}

export type TableColumn = {
  name: string
  dataType: string
  isNullable: boolean
  isIdentity: boolean
}

export type SchemaTable = {
  schema: string
  table: string
  estimatedRows: number
}

const DATA_DIR = join(process.cwd(), 'data')
const DB_PATH = join(DATA_DIR, 'history.db')

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

const sqlite = new DatabaseSync(DB_PATH)
sqlite.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS db_connections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    connection_string TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_db_connections_default
  ON db_connections(is_default)
  WHERE is_default = 1;

  CREATE TABLE IF NOT EXISTS query_history (
    id TEXT PRIMARY KEY,
    connection_name TEXT NOT NULL,
    query_text TEXT NOT NULL,
    status TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    row_count INTEGER,
    error_text TEXT,
    executed_at TEXT NOT NULL,
    started_at TEXT NOT NULL,
    metadata_json TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_query_history_executed_at
  ON query_history(executed_at DESC);

  CREATE TABLE IF NOT EXISTS query_snippets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    query_text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_query_snippets_updated_at
  ON query_snippets(updated_at DESC);
`)

const selectConnectionsStmt = sqlite.prepare(`
  SELECT
    id,
    name,
    connection_string,
    is_default,
    created_at,
    updated_at
  FROM db_connections
  ORDER BY is_default DESC, name ASC
`)

const selectConnectionByNameStmt = sqlite.prepare(`
  SELECT
    id,
    name,
    connection_string,
    is_default,
    created_at,
    updated_at
  FROM db_connections
  WHERE name = ?
  LIMIT 1
`)

const selectConnectionByIdStmt = sqlite.prepare(`
  SELECT
    id,
    name,
    connection_string,
    is_default,
    created_at,
    updated_at
  FROM db_connections
  WHERE id = ?
  LIMIT 1
`)

const insertConnectionStmt = sqlite.prepare(`
  INSERT INTO db_connections (
    id,
    name,
    connection_string,
    is_default,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?)
`)

const updateConnectionStmt = sqlite.prepare(`
  UPDATE db_connections
  SET
    name = ?,
    connection_string = ?,
    is_default = ?,
    updated_at = ?
  WHERE id = ?
`)

const deleteConnectionStmt = sqlite.prepare('DELETE FROM db_connections WHERE id = ?')
const clearDefaultConnectionStmt = sqlite.prepare('UPDATE db_connections SET is_default = 0 WHERE is_default = 1')
const setDefaultConnectionByIdStmt = sqlite.prepare(
  'UPDATE db_connections SET is_default = 1, updated_at = ? WHERE id = ?'
)

const insertHistoryStmt = sqlite.prepare(`
  INSERT INTO query_history (
    id,
    connection_name,
    query_text,
    status,
    duration_ms,
    row_count,
    error_text,
    executed_at,
    started_at,
    metadata_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const selectHistoryStmt = sqlite.prepare(`
  SELECT
    id,
    connection_name,
    query_text,
    status,
    duration_ms,
    row_count,
    error_text,
    executed_at,
    started_at,
    metadata_json
  FROM query_history
  ORDER BY executed_at DESC
  LIMIT ?
`)

const selectHistoryByConnectionStmt = sqlite.prepare(`
  SELECT
    id,
    connection_name,
    query_text,
    status,
    duration_ms,
    row_count,
    error_text,
    executed_at,
    started_at,
    metadata_json
  FROM query_history
  WHERE connection_name = ?
  ORDER BY executed_at DESC
  LIMIT ?
`)

const deleteHistoryStmt = sqlite.prepare('DELETE FROM query_history')
const deleteHistoryByConnectionStmt = sqlite.prepare('DELETE FROM query_history WHERE connection_name = ?')

const selectSnippetsStmt = sqlite.prepare(`
  SELECT
    id,
    title,
    query_text,
    created_at,
    updated_at
  FROM query_snippets
  ORDER BY updated_at DESC
  LIMIT ?
`)

const selectSnippetByIdStmt = sqlite.prepare(`
  SELECT
    id,
    title,
    query_text,
    created_at,
    updated_at
  FROM query_snippets
  WHERE id = ?
  LIMIT 1
`)

const insertSnippetStmt = sqlite.prepare(`
  INSERT INTO query_snippets (
    id,
    title,
    query_text,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?)
`)

const deleteSnippetStmt = sqlite.prepare('DELETE FROM query_snippets WHERE id = ?')

function sqlIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function runTransaction(fn: () => void) {
  sqlite.exec('BEGIN')
  try {
    fn()
    sqlite.exec('COMMIT')
  } catch (error) {
    sqlite.exec('ROLLBACK')
    throw error
  }
}

function normalizeConnectionRow(row: DbConnectionRow): DbConnection {
  return {
    id: row.id,
    name: row.name,
    connectionString: row.connection_string,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseEnvConnections(): Array<{ name: string; connectionString: string; isDefault: boolean }> {
  const parsed: Array<{ name: string; connectionString: string; isDefault: boolean }> = []
  const rawJson = process.env.PG_CONNECTIONS_JSON?.trim()
  if (rawJson) {
    try {
      const values = JSON.parse(rawJson) as Array<{
        name?: unknown
        connectionString?: unknown
        isDefault?: unknown
      }>
      for (const value of values || []) {
        const name = typeof value.name === 'string' ? value.name.trim() : ''
        const connectionString =
          typeof value.connectionString === 'string' ? value.connectionString.trim() : ''
        if (!name || !connectionString) continue
        parsed.push({ name, connectionString, isDefault: value.isDefault === true })
      }
    } catch {
      // Ignore invalid JSON and fallback to single connection env vars.
    }
  }

  const singleConnectionString = process.env.PG_CONNECTION_STRING?.trim() || ''
  if (singleConnectionString) {
    const singleName = process.env.PG_CONNECTION_NAME?.trim() || 'default'
    if (!parsed.some((item) => item.name === singleName)) {
      parsed.push({
        name: singleName,
        connectionString: singleConnectionString,
        isDefault: parsed.length === 0,
      })
    }
  }

  if (parsed.length > 0 && !parsed.some((item) => item.isDefault)) parsed[0].isDefault = true
  return parsed
}

function bootstrapConnectionsFromEnv() {
  const existing = selectConnectionsStmt.all() as DbConnectionRow[]
  if (existing.length > 0) return
  const seeded = parseEnvConnections()
  if (seeded.length === 0) return
  const now = new Date().toISOString()
  runTransaction(() => {
    for (const [index, item] of seeded.entries()) {
      insertConnectionStmt.run(
        randomUUID(),
        item.name,
        item.connectionString,
        item.isDefault || index === 0 ? 1 : 0,
        now,
        now
      )
    }
  })
}

bootstrapConnectionsFromEnv()

export function getConnections(): DbConnection[] {
  return (selectConnectionsStmt.all() as DbConnectionRow[]).map(normalizeConnectionRow)
}

export function getPublicConnections() {
  return getConnections().map((connection) => ({
    id: connection.id,
    name: connection.name,
    isDefault: connection.isDefault,
  }))
}

export function getDefaultConnectionName(): string | null {
  const all = getConnections()
  if (all.length === 0) return null
  const explicitDefault = all.find((connection) => connection.isDefault)
  return explicitDefault?.name || all[0].name
}

export function resolveConnectionName(connectionName?: string): string {
  const trimmed = connectionName?.trim() || ''
  if (trimmed) return trimmed
  const fallback = getDefaultConnectionName()
  if (!fallback) {
    const error = new Error('No database connections configured. Add one in Connections.') as Error & {
      statusCode?: number
    }
    error.statusCode = 400
    throw error
  }
  return fallback
}

function getConnectionByName(connectionName?: string): DbConnection {
  const resolvedName = resolveConnectionName(connectionName)
  const row = selectConnectionByNameStmt.get(resolvedName) as DbConnectionRow | undefined
  const connection = row ? normalizeConnectionRow(row) : null
  if (!connection) {
    const error = new Error(`Connection '${resolvedName}' not found. Configure it in Connections.`) as Error & {
      statusCode?: number
    }
    error.statusCode = 400
    throw error
  }
  return connection
}

async function withClient<T>(connectionName: string | undefined, fn: (client: any) => Promise<T>) {
  const connection = getConnectionByName(connectionName)
  const pool = new Pool({ connectionString: connection.connectionString })
  try {
    const client = await pool.connect()
    try {
      return await fn(client)
    } finally {
      client.release()
    }
  } finally {
    await pool.end()
  }
}

export function createConnection(input: {
  name: string
  connectionString: string
  isDefault?: boolean
}) {
  const name = input.name.trim()
  const connectionString = input.connectionString.trim()
  if (!name) throw new Error('name is required')
  if (!connectionString) throw new Error('connectionString is required')
  if (getConnections().some((connection) => connection.name === name)) {
    const error = new Error(`Connection '${name}' already exists`) as Error & { statusCode?: number }
    error.statusCode = 409
    throw error
  }
  const now = new Date().toISOString()
  const id = randomUUID()
  const shouldBeDefault = input.isDefault === true || getConnections().length === 0
  runTransaction(() => {
    if (shouldBeDefault) clearDefaultConnectionStmt.run()
    insertConnectionStmt.run(id, name, connectionString, shouldBeDefault ? 1 : 0, now, now)
  })
  const row = selectConnectionByIdStmt.get(id) as DbConnectionRow | undefined
  if (!row) throw new Error('failed to create connection')
  return normalizeConnectionRow(row)
}

export function updateConnection(
  id: string,
  input: {
    name?: string
    connectionString?: string
    isDefault?: boolean
  }
) {
  const existing = selectConnectionByIdStmt.get(id) as DbConnectionRow | undefined
  if (!existing) return null

  const nextName = input.name === undefined ? existing.name : input.name.trim()
  const nextConnectionString =
    input.connectionString === undefined ? existing.connection_string : input.connectionString.trim()
  const nextDefault = input.isDefault === undefined ? existing.is_default === 1 : input.isDefault

  if (!nextName) throw new Error('name cannot be empty')
  if (!nextConnectionString) throw new Error('connectionString cannot be empty')

  const duplicate = getConnections().find((connection) => connection.name === nextName && connection.id !== id)
  if (duplicate) {
    const error = new Error(`Connection '${nextName}' already exists`) as Error & { statusCode?: number }
    error.statusCode = 409
    throw error
  }

  const now = new Date().toISOString()
  runTransaction(() => {
    if (nextDefault) clearDefaultConnectionStmt.run()
    updateConnectionStmt.run(nextName, nextConnectionString, nextDefault ? 1 : 0, now, id)
    if (!nextDefault && getConnections().length > 0 && !getConnections().some((connection) => connection.isDefault)) {
      setDefaultConnectionByIdStmt.run(now, id)
    }
  })

  const updated = selectConnectionByIdStmt.get(id) as DbConnectionRow | undefined
  return updated ? normalizeConnectionRow(updated) : null
}

export function setDefaultConnection(id: string) {
  const existing = selectConnectionByIdStmt.get(id) as DbConnectionRow | undefined
  if (!existing) return null
  const now = new Date().toISOString()
  runTransaction(() => {
    clearDefaultConnectionStmt.run()
    setDefaultConnectionByIdStmt.run(now, id)
  })
  const updated = selectConnectionByIdStmt.get(id) as DbConnectionRow | undefined
  return updated ? normalizeConnectionRow(updated) : null
}

export function deleteConnection(id: string) {
  const existing = selectConnectionByIdStmt.get(id) as DbConnectionRow | undefined
  if (!existing) return false

  const all = getConnections()
  if (all.length <= 1) {
    const error = new Error('Cannot delete the last connection') as Error & { statusCode?: number }
    error.statusCode = 400
    throw error
  }

  const now = new Date().toISOString()
  runTransaction(() => {
    deleteConnectionStmt.run(id)
    const remaining = getConnections()
    if (!remaining.some((connection) => connection.isDefault) && remaining[0]) {
      setDefaultConnectionByIdStmt.run(now, remaining[0].id)
    }
  })
  return true
}

function splitStatements(sql: string): string[] {
  const out: string[] = []
  let current = ''
  let quote: string | null = null
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i]
    if ((ch === "'" || ch === '"') && sql[i - 1] !== '\\') {
      if (quote === ch) quote = null
      else if (!quote) quote = ch
      current += ch
      continue
    }
    if (ch === ';' && !quote) {
      if (current.trim()) out.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) out.push(current.trim())
  return out
}

function parseHistoryRow(row: QueryHistoryRow) {
  return {
    ...row,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
    metadata_json: undefined,
  }
}

export function getHistory(limit = 100, connectionName?: string) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100))
  if (connectionName && connectionName.trim()) {
    const resolved = resolveConnectionName(connectionName)
    return (selectHistoryByConnectionStmt.all(resolved, safeLimit) as QueryHistoryRow[]).map(parseHistoryRow)
  }
  return (selectHistoryStmt.all(safeLimit) as QueryHistoryRow[]).map(parseHistoryRow)
}

export function clearHistory(connectionName?: string) {
  if (connectionName && connectionName.trim()) {
    const resolved = resolveConnectionName(connectionName)
    deleteHistoryByConnectionStmt.run(resolved)
    return
  }
  deleteHistoryStmt.run()
}

export function getSnippets(limit = 100) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100))
  return selectSnippetsStmt.all(safeLimit) as QuerySnippetRow[]
}

export function saveSnippet({
  title,
  queryText,
}: {
  title: string
  queryText: string
}) {
  const now = new Date().toISOString()
  const id = randomUUID()
  insertSnippetStmt.run(id, title.trim(), queryText.trim(), now, now)
  return { id, title: title.trim(), query_text: queryText.trim(), created_at: now, updated_at: now }
}

export function updateSnippet({
  id,
  title,
  queryText,
}: {
  id: string
  title?: string
  queryText?: string
}) {
  const changes: string[] = []
  const values: any[] = []

  if (title !== undefined) {
    changes.push('title = ?')
    values.push(title.trim())
  }

  if (queryText !== undefined) {
    changes.push('query_text = ?')
    values.push(queryText.trim())
  }

  if (changes.length === 0) {
    return (selectSnippetByIdStmt.get(id) as QuerySnippetRow | undefined) || null
  }

  const now = new Date().toISOString()
  changes.push('updated_at = ?')
  values.push(now)
  values.push(id)

  const statement = sqlite.prepare(`
    UPDATE query_snippets
    SET ${changes.join(', ')}
    WHERE id = ?
  `)
  const result = statement.run(...values) as { changes?: number }
  if (!result.changes) return null

  return (selectSnippetByIdStmt.get(id) as QuerySnippetRow | undefined) || null
}

export function deleteSnippet(id: string) {
  deleteSnippetStmt.run(id)
}

export async function executeQuery({
  query,
  connectionName,
}: {
  query: string
  connectionName?: string
}) {
  const connection = getConnectionByName(connectionName)
  const startedAt = new Date()
  const startedTs = Date.now()
  const historyId = randomUUID()

  const pool = new Pool({ connectionString: connection.connectionString })

  try {
    const client = await pool.connect()
    try {
      const statements = splitStatements(query)
      const results: Array<{
        command: string
        rowCount: number
        fields: string[]
        rows: Record<string, unknown>[]
      }> = []

      for (const statement of statements) {
        const result = await client.query(statement)
        results.push({
          command: result.command,
          rowCount: result.rowCount ?? 0,
          fields: result.fields.map((f: { name: string }) => f.name),
          rows: result.rows,
        })
      }

      const finishedAt = new Date()
      const durationMs = Date.now() - startedTs
      const totalRows = results.reduce((sum, r) => sum + (r.rowCount || 0), 0)

      insertHistoryStmt.run(
        historyId,
        connection.name,
        query,
        'success',
        durationMs,
        totalRows,
        null,
        finishedAt.toISOString(),
        startedAt.toISOString(),
        JSON.stringify({ statements: statements.length })
      )

      return {
        id: historyId,
        status: 'success' as const,
        durationMs,
        totalRows,
        statements: results,
        ranAt: finishedAt.toISOString(),
      }
    } finally {
      client.release()
    }
  } catch (error) {
    const finishedAt = new Date()
    const durationMs = Date.now() - startedTs
    const message = error instanceof Error ? error.message : String(error)

    insertHistoryStmt.run(
      historyId,
      connection.name,
      query,
      'error',
      durationMs,
      0,
      message,
      finishedAt.toISOString(),
      startedAt.toISOString(),
      JSON.stringify({})
    )

    const err = new Error(message) as Error & { statusCode?: number }
    err.statusCode = 400
    throw err
  } finally {
    await pool.end()
  }
}

export async function listTables(connectionName?: string): Promise<TableInfo[]> {
  return withClient(connectionName, async (client) => {
    const sql = `
      select
        n.nspname as schema,
        c.relname as table,
        greatest(c.reltuples::bigint, 0)::bigint as estimated_rows
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r'
        and n.nspname not in ('pg_catalog', 'information_schema')
      order by n.nspname, c.relname
      limit 200
    `
    const { rows } = await client.query(sql)
    return rows.map((r: any) => ({
      schema: String(r.schema),
      table: String(r.table),
      estimatedRows: Number(r.estimated_rows || 0),
    }))
  })
}

export async function getTableColumns(
  connectionName: string | undefined,
  table: string,
  schema = 'public'
): Promise<TableColumn[]> {
  return withClient(connectionName, async (client) => {
    const sql = `
      select
        column_name,
        data_type,
        is_nullable,
        is_identity
      from information_schema.columns
      where table_schema = $1
        and table_name = $2
      order by ordinal_position
    `
    const { rows } = await client.query(sql, [schema, table])
    return rows.map((r: any) => ({
      name: String(r.column_name),
      dataType: String(r.data_type),
      isNullable: r.is_nullable === 'YES',
      isIdentity: r.is_identity === 'YES',
    }))
  })
}

export async function getTableRows(
  connectionName: string | undefined,
  table: string,
  options: {
    limit?: number
    offset?: number
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
    filterColumn?: string
    filterValue?: string
    filterMode?: 'contains' | 'equals'
  } = {}
) {
  return withClient(connectionName, async (client) => {
    const limit = Math.max(1, Math.min(500, Number(options.limit || 100)))
    const offset = Math.max(0, Number(options.offset || 0))
    const sortBy = options.sortBy ? sqlIdent(options.sortBy) : sqlIdent('_ctid')
    const sortOrder = options.sortOrder === 'desc' ? 'desc' : 'asc'
    const filterMode = options.filterMode === 'equals' ? 'equals' : 'contains'
    const filterColumn = options.filterColumn ? sqlIdent(options.filterColumn) : ''
    const filterValue = (options.filterValue || '').trim()

    const qTable = `${sqlIdent('public')}.${sqlIdent(table)}`
    const whereClause =
      filterColumn && filterValue
        ? filterMode === 'equals'
          ? ` where cast(${filterColumn} as text) = $1 `
          : ` where cast(${filterColumn} as text) ilike $1 `
        : ''
    const filterParam =
      filterColumn && filterValue ? (filterMode === 'equals' ? filterValue : `%${filterValue}%`) : undefined
    const params = filterParam ? [filterParam] : []

    const sql = `
      select ctid::text as _ctid, *
      from ${qTable}
      ${whereClause}
      order by ${sortBy} ${sortOrder}
      limit $${params.length + 1} offset $${params.length + 2}
    `
    const countSql = `select count(*)::bigint as total from ${qTable} ${whereClause}`
    const [rowsResult, countResult] = await Promise.all([
      client.query(sql, [...params, limit, offset]),
      client.query(countSql, params),
    ])
    return {
      rows: rowsResult.rows as Record<string, unknown>[],
      total: Number(countResult.rows[0]?.total || 0),
    }
  })
}

export async function listSchemaObjects(connectionName?: string): Promise<SchemaTable[]> {
  return withClient(connectionName, async (client) => {
    const sql = `
      select
        n.nspname as schema,
        c.relname as table,
        greatest(c.reltuples::bigint, 0)::bigint as estimated_rows
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r'
        and n.nspname not in ('pg_catalog', 'information_schema')
      order by n.nspname, c.relname
      limit 2000
    `
    const { rows } = await client.query(sql)
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      schema: String(row.schema || 'public'),
      table: String(row.table || ''),
      estimatedRows: Number(row.estimated_rows || 0),
    }))
  })
}

export async function updateTableRowByCtid(
  connectionName: string | undefined,
  table: string,
  ctid: string,
  patch: Record<string, unknown>
) {
  const keys = Object.keys(patch)
  if (keys.length === 0) return

  return withClient(connectionName, async (client) => {
    const qTable = `${sqlIdent('public')}.${sqlIdent(table)}`
    const setClause = keys.map((k, i) => `${sqlIdent(k)} = $${i + 1}`).join(', ')
    const values = keys.map((k) => patch[k])
    const sql = `update ${qTable} set ${setClause} where ctid::text = $${keys.length + 1}`
    await client.query(sql, [...values, ctid])
  })
}

export async function insertTableRow(
  connectionName: string | undefined,
  table: string,
  payload: Record<string, unknown>
) {
  const keys = Object.keys(payload)
  if (keys.length === 0) return

  return withClient(connectionName, async (client) => {
    const qTable = `${sqlIdent('public')}.${sqlIdent(table)}`
    const columns = keys.map((k) => sqlIdent(k)).join(', ')
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
    const values = keys.map((k) => payload[k])
    const sql = `insert into ${qTable} (${columns}) values (${placeholders})`
    await client.query(sql, values)
  })
}

export async function deleteTableRowByCtid(connectionName: string | undefined, table: string, ctid: string) {
  return withClient(connectionName, async (client) => {
    const qTable = `${sqlIdent('public')}.${sqlIdent(table)}`
    const sql = `delete from ${qTable} where ctid::text = $1`
    await client.query(sql, [ctid])
  })
}
