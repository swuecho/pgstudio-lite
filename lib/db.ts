import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import pg from 'pg'

const { Pool } = pg

type DbConnection = {
  name: string
  connectionString: string
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

const deleteHistoryStmt = sqlite.prepare('DELETE FROM query_history')

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

function getConnectionByName(connectionName: string): DbConnection {
  const connection = getConnections().find((c) => c.name === connectionName)
  if (!connection) {
    const error = new Error(
      `Connection '${connectionName}' not found. Set PG_CONNECTION_STRING and optional PG_CONNECTION_NAME.`
    ) as Error & { statusCode?: number }
    error.statusCode = 400
    throw error
  }
  return connection
}

async function withClient<T>(connectionName: string, fn: (client: any) => Promise<T>) {
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

export function getConnections(): DbConnection[] {
  return [
    {
      name: process.env.PG_CONNECTION_NAME || 'default',
      connectionString: process.env.PG_CONNECTION_STRING || '',
    },
  ].filter((c) => c.connectionString.length > 0)
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

export function getHistory(limit = 100) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100))
  return (selectHistoryStmt.all(safeLimit) as QueryHistoryRow[]).map(parseHistoryRow)
}

export function clearHistory() {
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

export function deleteSnippet(id: string) {
  deleteSnippetStmt.run(id)
}

export async function executeQuery({
  query,
  connectionName,
}: {
  query: string
  connectionName: string
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

export async function listTables(connectionName: string): Promise<TableInfo[]> {
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
  connectionName: string,
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
  connectionName: string,
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

export async function listSchemaObjects(connectionName: string): Promise<SchemaTable[]> {
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
  connectionName: string,
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
  connectionName: string,
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

export async function deleteTableRowByCtid(connectionName: string, table: string, ctid: string) {
  return withClient(connectionName, async (client) => {
    const qTable = `${sqlIdent('public')}.${sqlIdent(table)}`
    const sql = `delete from ${qTable} where ctid::text = $1`
    await client.query(sql, [ctid])
  })
}
