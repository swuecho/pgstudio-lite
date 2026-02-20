import { randomUUID } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import pg from 'pg'
import { dbConnections, queryHistory, querySnippets } from '../drizzle/schema'
import { metaDb } from './meta-db'

const { Pool } = pg

type DbConnection = {
  id: string
  name: string
  connectionString: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
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

function sqlIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
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
      // Ignore malformed JSON and fallback to single-connection env vars.
    }
  }

  const singleConnectionString = process.env.PG_CONNECTION_STRING?.trim() || ''
  if (singleConnectionString) {
    const singleName = process.env.PG_CONNECTION_NAME?.trim() || 'default'
    if (!parsed.some((item) => item.name === singleName)) {
      parsed.push({ name: singleName, connectionString: singleConnectionString, isDefault: parsed.length === 0 })
    }
  }

  if (parsed.length > 0 && !parsed.some((item) => item.isDefault)) parsed[0].isDefault = true
  return parsed
}

function seedConnectionsIfEmpty() {
  const hasConnections = metaDb.select({ id: dbConnections.id }).from(dbConnections).limit(1).get()
  if (hasConnections) return
  const seeded = parseEnvConnections()
  if (seeded.length === 0) return
  const now = new Date().toISOString()
  metaDb.transaction((tx) => {
    for (const [index, connection] of seeded.entries()) {
      tx.insert(dbConnections)
        .values({
          id: randomUUID(),
          name: connection.name,
          connectionString: connection.connectionString,
          isDefault: connection.isDefault || index === 0,
          createdAt: now,
          updatedAt: now,
        })
        .run()
    }
  })
}

seedConnectionsIfEmpty()

function mapConnection(row: typeof dbConnections.$inferSelect): DbConnection {
  return {
    id: row.id,
    name: row.name,
    connectionString: row.connectionString,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function getResolvedConnectionName(connectionName?: string) {
  const trimmed = connectionName?.trim() || ''
  if (trimmed) return trimmed
  const defaultConnection = getConnections().find((connection) => connection.isDefault)
  if (defaultConnection) return defaultConnection.name
  const first = getConnections()[0]?.name
  if (!first) {
    const error = new Error('No database connection configured. Use Manage Connections to add one.') as Error & {
      statusCode?: number
    }
    error.statusCode = 400
    throw error
  }
  return first
}

function resolveConnectionName(connectionName?: string) {
  return getResolvedConnectionName(connectionName)
}

function getConnectionByName(connectionName?: string): DbConnection {
  const resolved = resolveConnectionName(connectionName)
  const connection = getConnections().find((c) => c.name === resolved)
  if (!connection) {
    const error = new Error(
      `Connection '${resolved}' not found. Set PG_CONNECTION_STRING and optional PG_CONNECTION_NAME.`
    ) as Error & { statusCode?: number }
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

export function getConnections(): DbConnection[] {
  return metaDb.select().from(dbConnections).orderBy(desc(dbConnections.isDefault), dbConnections.name).all().map(mapConnection)
}

export function getPublicConnections() {
  return getConnections().map((connection) => ({
    id: connection.id,
    name: connection.name,
    isDefault: connection.isDefault,
  }))
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

  const id = randomUUID()
  const now = new Date().toISOString()
  const shouldBeDefault = input.isDefault === true || getConnections().length === 0

  metaDb.transaction((tx) => {
    if (shouldBeDefault) tx.update(dbConnections).set({ isDefault: false }).run()
    tx.insert(dbConnections)
      .values({
        id,
        name,
        connectionString,
        isDefault: shouldBeDefault,
        createdAt: now,
        updatedAt: now,
      })
      .run()
  })

  const created = metaDb.select().from(dbConnections).where(eq(dbConnections.id, id)).get()
  if (!created) throw new Error('failed to create connection')
  return mapConnection(created)
}

export function updateConnection(
  id: string,
  input: { name?: string; connectionString?: string; isDefault?: boolean }
) {
  const existing = metaDb.select().from(dbConnections).where(eq(dbConnections.id, id)).get()
  if (!existing) return null

  const nextName = input.name === undefined ? existing.name : input.name.trim()
  const nextConnectionString =
    input.connectionString === undefined ? existing.connectionString : input.connectionString.trim()
  const nextDefault = input.isDefault === undefined ? existing.isDefault : input.isDefault

  if (!nextName) throw new Error('name cannot be empty')
  if (!nextConnectionString) throw new Error('connectionString cannot be empty')

  const duplicate = getConnections().find((connection) => connection.name === nextName && connection.id !== id)
  if (duplicate) {
    const error = new Error(`Connection '${nextName}' already exists`) as Error & { statusCode?: number }
    error.statusCode = 409
    throw error
  }

  const now = new Date().toISOString()
  metaDb.transaction((tx) => {
    if (nextDefault) tx.update(dbConnections).set({ isDefault: false }).run()
    tx.update(dbConnections)
      .set({
        name: nextName,
        connectionString: nextConnectionString,
        isDefault: nextDefault,
        updatedAt: now,
      })
      .where(eq(dbConnections.id, id))
      .run()
    const hasDefault = tx.select({ id: dbConnections.id }).from(dbConnections).where(eq(dbConnections.isDefault, true)).get()
    if (!hasDefault) {
      tx.update(dbConnections).set({ isDefault: true, updatedAt: now }).where(eq(dbConnections.id, id)).run()
    }
  })

  const updated = metaDb.select().from(dbConnections).where(eq(dbConnections.id, id)).get()
  return updated ? mapConnection(updated) : null
}

export function setDefaultConnection(id: string) {
  const existing = metaDb.select().from(dbConnections).where(eq(dbConnections.id, id)).get()
  if (!existing) return null
  const now = new Date().toISOString()
  metaDb.transaction((tx) => {
    tx.update(dbConnections).set({ isDefault: false }).run()
    tx.update(dbConnections).set({ isDefault: true, updatedAt: now }).where(eq(dbConnections.id, id)).run()
  })
  const updated = metaDb.select().from(dbConnections).where(eq(dbConnections.id, id)).get()
  return updated ? mapConnection(updated) : null
}

export function deleteConnection(id: string) {
  const existing = metaDb.select().from(dbConnections).where(eq(dbConnections.id, id)).get()
  if (!existing) return false
  const all = getConnections()
  if (all.length <= 1) {
    const error = new Error('Cannot delete the last connection') as Error & { statusCode?: number }
    error.statusCode = 400
    throw error
  }

  const now = new Date().toISOString()
  metaDb.transaction((tx) => {
    tx.delete(dbConnections).where(eq(dbConnections.id, id)).run()
    const hasDefault = tx.select({ id: dbConnections.id }).from(dbConnections).where(eq(dbConnections.isDefault, true)).get()
    if (!hasDefault) {
      const first = tx.select({ id: dbConnections.id }).from(dbConnections).orderBy(dbConnections.name).limit(1).get()
      if (first) tx.update(dbConnections).set({ isDefault: true, updatedAt: now }).where(eq(dbConnections.id, first.id)).run()
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
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

export function getHistory(limit = 100, connectionName?: string) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100))
  const resolved = connectionName?.trim()
  const rows = resolved
    ? metaDb
        .select()
        .from(queryHistory)
        .where(eq(queryHistory.connectionName, resolved))
        .orderBy(desc(queryHistory.executedAt))
        .limit(safeLimit)
        .all()
    : metaDb.select().from(queryHistory).orderBy(desc(queryHistory.executedAt)).limit(safeLimit).all()
  return rows.map((row) => parseHistoryRow(toHistoryRow(row)))
}

export function clearHistory(connectionName?: string) {
  const resolved = connectionName?.trim()
  if (!resolved) {
    metaDb.delete(queryHistory).run()
    return
  }
  metaDb.delete(queryHistory).where(eq(queryHistory.connectionName, resolved)).run()
}

export function getSnippets(limit = 100) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100))
  return metaDb
    .select()
    .from(querySnippets)
    .orderBy(desc(querySnippets.updatedAt))
    .limit(safeLimit)
    .all()
    .map(toSnippetRow)
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
  metaDb
    .insert(querySnippets)
    .values({ id, title: title.trim(), queryText: queryText.trim(), createdAt: now, updatedAt: now })
    .run()
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
  if (title === undefined && queryText === undefined) {
    const row = metaDb.select().from(querySnippets).where(eq(querySnippets.id, id)).get()
    return row ? toSnippetRow(row) : null
  }

  const values: Partial<typeof querySnippets.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  }
  if (title !== undefined) values.title = title.trim()
  if (queryText !== undefined) values.queryText = queryText.trim()

  const result = metaDb.update(querySnippets).set(values).where(eq(querySnippets.id, id)).run()
  if (!result.changes) return null

  const row = metaDb.select().from(querySnippets).where(eq(querySnippets.id, id)).get()
  return row ? toSnippetRow(row) : null
}

export function deleteSnippet(id: string) {
  metaDb.delete(querySnippets).where(eq(querySnippets.id, id)).run()
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

      metaDb
        .insert(queryHistory)
        .values({
          id: historyId,
          connectionName: connection.name,
          queryText: query,
          status: 'success',
          durationMs,
          rowCount: totalRows,
          errorText: null,
          executedAt: finishedAt.toISOString(),
          startedAt: startedAt.toISOString(),
          metadataJson: JSON.stringify({ statements: statements.length }),
        })
        .run()

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

    metaDb
      .insert(queryHistory)
      .values({
        id: historyId,
        connectionName: connection.name,
        queryText: query,
        status: 'error',
        durationMs,
        rowCount: 0,
        errorText: message,
        executedAt: finishedAt.toISOString(),
        startedAt: startedAt.toISOString(),
        metadataJson: JSON.stringify({}),
      })
      .run()

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
