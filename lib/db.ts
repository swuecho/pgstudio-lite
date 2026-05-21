import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import pg from 'pg'
import { parseSql } from './pg-parser'
import { extractSelectOutputColumnNames, narrowResultToSelectList } from './query-output-columns'
import { dbConnections, notebooks, queryHistory, querySnippets } from '../drizzle/schema'
import { metaDb } from './meta-db'
import { isMutableRelationKind, mapPgRelkind, type RelationKind } from './relation-kind'
import { buildTableRowFilter, hasActiveTableFilter, type TableFilterMode } from './table-filter'
import { parsePgStringArray } from './pg-array'
import { sanitizeRowsQueryOptions } from './table-query-options'

const { Pool } = pg
type PgPool = InstanceType<typeof Pool>
type PoolClient = Awaited<ReturnType<PgPool['connect']>>
const connectionPools = new Map<string, PgPool>()
const QUERY_STATEMENT_TIMEOUT_MS = 15_000
const MAX_RESULT_ROWS = 500

type DbConnection = {
  id: string
  name: string
  connectionString: string
  isDefault: boolean
  readOnly: boolean
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
  connection_name: string
  created_at: string
  updated_at: string
}

export type { RelationKind } from './relation-kind'

export type TableInfo = {
  table: string
  schema: string
  estimatedRows: number
  kind: RelationKind
}

export type ColumnForeignKey = {
  constraintName: string
  referencedSchema: string
  referencedTable: string
  referencedColumn: string
  constraintColumns: string[]
  constraintReferencedColumns: string[]
}

export type ForeignKeyConstraint = {
  name: string
  columns: string[]
  referencedSchema: string
  referencedTable: string
  referencedColumns: string[]
}

export type TableColumn = {
  name: string
  dataType: string
  isNullable: boolean
  isIdentity: boolean
  isPrimaryKey: boolean
  foreignKey?: ColumnForeignKey
}

export type SchemaTable = {
  schema: string
  table: string
  estimatedRows: number
  kind: RelationKind
}

type RowKey = Record<string, unknown>

type QueryTableTarget = {
  schema: string
  table: string
}

function sqlIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function parseEnvConnections(): Array<{
  name: string
  connectionString: string
  isDefault: boolean
  readOnly: boolean
}> {
  const parsed: Array<{ name: string; connectionString: string; isDefault: boolean; readOnly: boolean }> = []
  const rawJson = process.env.PG_CONNECTIONS_JSON?.trim()
  if (rawJson) {
    try {
      const values = JSON.parse(rawJson) as Array<{
        name?: unknown
        connectionString?: unknown
        isDefault?: unknown
        readOnly?: unknown
      }>
      for (const value of values || []) {
        const name = typeof value.name === 'string' ? value.name.trim() : ''
        const connectionString =
          typeof value.connectionString === 'string' ? value.connectionString.trim() : ''
        if (!name || !connectionString) continue
        parsed.push({
          name,
          connectionString,
          isDefault: value.isDefault === true,
          readOnly: value.readOnly === true,
        })
      }
    } catch {
      // Ignore malformed JSON and fallback to single-connection env vars.
    }
  }

  const singleConnectionString = process.env.PG_CONNECTION_STRING?.trim() || ''
  if (singleConnectionString) {
    const singleName = process.env.PG_CONNECTION_NAME?.trim() || 'default'
    const singleReadOnly = process.env.PG_CONNECTION_READ_ONLY?.trim() === 'true'
    if (!parsed.some((item) => item.name === singleName)) {
      parsed.push({
        name: singleName,
        connectionString: singleConnectionString,
        isDefault: parsed.length === 0,
        readOnly: singleReadOnly,
      })
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
          readOnly: connection.readOnly,
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
    readOnly: row.readOnly,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function getResolvedConnectionName(connectionName?: string) {
  const trimmed = connectionName?.trim() || ''
  if (trimmed) return trimmed
  const all = getConnections()
  const defaultConnection = all.find((connection) => connection.isDefault)
  if (defaultConnection) return defaultConnection.name
  const first = all[0]?.name
  if (!first) {
    const error = new Error(
      'No database connection configured. Use Manage Connections to add one.'
    ) as Error & {
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

async function withClient<T>(connectionName: string | undefined, fn: (client: PoolClient) => Promise<T>) {
  const connection = getConnectionByName(connectionName)
  const pool = getPool(connection.connectionString)
  try {
    const client = await pool.connect()
    try {
      return await fn(client)
    } finally {
      client.release()
    }
  } finally {
    // Pools are intentionally reused across requests.
  }
}

async function getTableForeignKeysForClient(
  client: PoolClient,
  schema: string,
  table: string
): Promise<ForeignKeyConstraint[]> {
  const sql = `
    select
      c.conname as constraint_name,
      json_agg(a.attname order by u.ord) as columns,
      nf.nspname as referenced_schema,
      cf.relname as referenced_table,
      json_agg(af.attname order by u.ord) as referenced_columns
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_class cf on cf.oid = c.confrelid
    join pg_namespace nf on nf.oid = cf.relnamespace
    join unnest(c.conkey, c.confkey) with ordinality as u(attnum, refattnum, ord) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = u.attnum and not a.attisdropped
    join pg_attribute af on af.attrelid = c.confrelid and af.attnum = u.refattnum and not af.attisdropped
    where c.contype = 'f'
      and n.nspname = $1
      and cl.relname = $2
    group by c.conname, nf.nspname, cf.relname
    order by c.conname
  `
  const { rows } = await client.query(sql, [schema, table])
  return rows.map((row: Record<string, unknown>) => ({
    name: String(row.constraint_name),
    columns: parsePgStringArray(row.columns),
    referencedSchema: String(row.referenced_schema),
    referencedTable: String(row.referenced_table),
    referencedColumns: parsePgStringArray(row.referenced_columns),
  }))
}

function buildColumnForeignKeyMap(
  constraints: ForeignKeyConstraint[]
): Map<string, ColumnForeignKey> {
  const byColumn = new Map<string, ColumnForeignKey>()
  for (const constraint of constraints) {
    for (let index = 0; index < constraint.columns.length; index += 1) {
      const columnName = constraint.columns[index]
      if (byColumn.has(columnName)) continue
      byColumn.set(columnName, {
        constraintName: constraint.name,
        referencedSchema: constraint.referencedSchema,
        referencedTable: constraint.referencedTable,
        referencedColumn: constraint.referencedColumns[index] || '',
        constraintColumns: constraint.columns,
        constraintReferencedColumns: constraint.referencedColumns,
      })
    }
  }
  return byColumn
}

async function getPrimaryKeyColumns(client: PoolClient, schema: string, table: string): Promise<string[]> {
  const sql = `
    select a.attname as column_name
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    join unnest(i.indkey) with ordinality as k(attnum, ordinality) on true
    join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
    where i.indisprimary
      and n.nspname = $1
      and c.relname = $2
    order by k.ordinality
  `
  const { rows } = await client.query(sql, [schema, table])
  return rows.map((row: any) => String(row.column_name))
}

function getPool(connectionString: string) {
  const existing = connectionPools.get(connectionString)
  if (existing) return existing
  const pool = new Pool({ connectionString })
  connectionPools.set(connectionString, pool)
  return pool
}

function closePool(connectionString: string) {
  const pool = connectionPools.get(connectionString)
  if (!pool) return
  connectionPools.delete(connectionString)
  void pool.end().catch(() => {
    // Swallow pool shutdown errors during lifecycle cleanup.
  })
}

function closePoolIfUnused(connectionString: string) {
  const stillUsed = getConnections().some((connection) => connection.connectionString === connectionString)
  if (stillUsed) return
  closePool(connectionString)
}

export function getConnections(): DbConnection[] {
  return metaDb
    .select()
    .from(dbConnections)
    .orderBy(desc(dbConnections.isDefault), dbConnections.name)
    .all()
    .map(mapConnection)
}

export function getPublicConnections() {
  return getConnections().map((connection) => ({
    id: connection.id,
    name: connection.name,
    isDefault: connection.isDefault,
    readOnly: connection.readOnly,
  }))
}

export function createConnection(input: {
  name: string
  connectionString: string
  isDefault?: boolean
  readOnly?: boolean
}) {
  const name = input.name.trim()
  const connectionString = input.connectionString.trim()
  if (!name) throw new Error('name is required')
  if (!connectionString) throw new Error('connectionString is required')
  const existing = getConnections()
  if (existing.some((connection) => connection.name === name)) {
    const error = new Error(`Connection '${name}' already exists`) as Error & { statusCode?: number }
    error.statusCode = 409
    throw error
  }

  const id = randomUUID()
  const now = new Date().toISOString()
  const shouldBeDefault = input.isDefault === true || existing.length === 0
  const readOnly = input.readOnly === true

  metaDb.transaction((tx) => {
    if (shouldBeDefault) tx.update(dbConnections).set({ isDefault: false }).run()
    tx.insert(dbConnections)
      .values({
        id,
        name,
        connectionString,
        isDefault: shouldBeDefault,
        readOnly,
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
  input: { name?: string; connectionString?: string; isDefault?: boolean; readOnly?: boolean }
) {
  const existing = metaDb.select().from(dbConnections).where(eq(dbConnections.id, id)).get()
  if (!existing) return null

  const nextName = input.name === undefined ? existing.name : input.name.trim()
  const nextConnectionString =
    input.connectionString === undefined ? existing.connectionString : input.connectionString.trim()
  const nextDefault = input.isDefault === undefined ? existing.isDefault : input.isDefault
  const nextReadOnly = input.readOnly === undefined ? existing.readOnly : input.readOnly

  if (!nextName) throw new Error('name cannot be empty')
  if (!nextConnectionString) throw new Error('connectionString cannot be empty')

  const duplicate = getConnections().find(
    (connection) => connection.name === nextName && connection.id !== id
  )
  if (duplicate) {
    const error = new Error(`Connection '${nextName}' already exists`) as Error & { statusCode?: number }
    error.statusCode = 409
    throw error
  }

  const now = new Date().toISOString()
  const renamed = existing.name !== nextName
  metaDb.transaction((tx) => {
    if (nextDefault) tx.update(dbConnections).set({ isDefault: false }).run()
    tx.update(dbConnections)
      .set({
        name: nextName,
        connectionString: nextConnectionString,
        isDefault: nextDefault,
        readOnly: nextReadOnly,
        updatedAt: now,
      })
      .where(eq(dbConnections.id, id))
      .run()
    if (renamed) {
      tx.update(notebooks)
        .set({ connectionName: nextName, updatedAt: now })
        .where(eq(notebooks.connectionName, existing.name))
        .run()
      tx.update(querySnippets)
        .set({ connectionName: nextName, updatedAt: now })
        .where(eq(querySnippets.connectionName, existing.name))
        .run()
      tx.update(queryHistory)
        .set({ connectionName: nextName })
        .where(eq(queryHistory.connectionName, existing.name))
        .run()
    }
    const hasDefault = tx
      .select({ id: dbConnections.id })
      .from(dbConnections)
      .where(eq(dbConnections.isDefault, true))
      .get()
    if (!hasDefault) {
      tx.update(dbConnections).set({ isDefault: true, updatedAt: now }).where(eq(dbConnections.id, id)).run()
    }
  })

  const updated = metaDb.select().from(dbConnections).where(eq(dbConnections.id, id)).get()
  if (existing.connectionString !== nextConnectionString) {
    closePoolIfUnused(existing.connectionString)
  }
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
    const hasDefault = tx
      .select({ id: dbConnections.id })
      .from(dbConnections)
      .where(eq(dbConnections.isDefault, true))
      .get()
    if (!hasDefault) {
      const first = tx
        .select({ id: dbConnections.id })
        .from(dbConnections)
        .orderBy(dbConnections.name)
        .limit(1)
        .get()
      if (first)
        tx.update(dbConnections)
          .set({ isDefault: true, updatedAt: now })
          .where(eq(dbConnections.id, first.id))
          .run()
    }
  })
  closePoolIfUnused(existing.connectionString)
  return true
}

let sqlParserReady: Promise<void> | undefined

function getSqlParser(): Promise<void> {
  if (!sqlParserReady) {
    sqlParserReady = parseSql('select 1').then(() => undefined)
  }
  return sqlParserReady
}

export async function splitStatements(sql: string): Promise<string[]> {
  const trimmed = sql.trim()
  if (!trimmed) return []
  await getSqlParser()
  const { stmts } = await parseSql(trimmed)
  if (!stmts || stmts.length === 0) return []
  return stmts.map((s) => {
    const start = s.stmt_location ?? 0
    const end = s.stmt_len != null ? start + s.stmt_len : trimmed.length
    return trimmed.slice(start, end).trim().replace(/;+$/, '')
  })
}

const WRITE_STMT_TYPES = new Set([
  'InsertStmt', 'UpdateStmt', 'DeleteStmt', 'MergeStmt',
  'CreateStmt', 'CreateSchemaStmt', 'CreateFunctionStmt', 'CreatePLangStmt',
  'CreateTableAsStmt', 'CreateSeqStmt', 'CreateRoleStmt', 'CreateTrigStmt',
  'CreateCastStmt', 'CreateOpClassStmt', 'CreateOpFamilyStmt',
  'CreateConversionStmt', 'CreateDomainStmt', 'CreateExtensionStmt',
  'CreateFdwStmt', 'CreateForeignServerStmt', 'CreateForeignTableStmt',
  'CreatePolicyStmt', 'CreatePublicationStmt', 'CreateStatsStmt',
  'CreateSubStmt', 'CreateTransformStmt', 'CreateAmStmt',
  'CreateUserMappingStmt', 'IndexStmt', 'ViewStmt', 'RuleStmt',
  'AlterTableStmt', 'AlterDomainStmt', 'AlterFunctionStmt',
  'AlterObjectDependsStmt', 'AlterObjectSchemaStmt', 'AlterOwnerStmt',
  'AlterOperatorStmt', 'AlterTypeStmt', 'AlterPolicyStmt', 'AlterSeqStmt',
  'AlterSystemStmt', 'AlterTSConfigStmt', 'AlterTSDictStmt',
  'AlterCollationStmt', 'AlterFdwStmt', 'AlterForeignServerStmt',
  'AlterDefaultPrivilegesStmt', 'AlterExtensionStmt',
  'AlterExtensionContentsStmt', 'AlterPublicationStmt', 'AlterSubStmt',
  'AlterRoleStmt', 'AlterStatsStmt', 'AlterOpFamilyStmt', 'RenameStmt',
  'DropStmt', 'TruncateStmt',
  'GrantStmt', 'CommentStmt', 'VacuumStmt', 'ReindexStmt', 'ClusterStmt',
  'RefreshMatViewStmt', 'CallStmt', 'DoStmt', 'CopyStmt',
  'ListenStmt', 'NotifyStmt', 'UnlistenStmt',
  'DiscardStmt', 'DefineStmt', 'CompositeTypeStmt', 'SecLabelStmt',
  'ImportForeignSchemaStmt', 'CheckPointStmt',
])

async function isWriteStatement(sql: string): Promise<boolean> {
  await getSqlParser()
  const { stmts } = await parseSql(sql)
  if (!stmts || stmts.length === 0) return false
  const nodeType = Object.keys(stmts[0].stmt as Record<string, unknown>)[0]
  return WRITE_STMT_TYPES.has(nodeType)
}

async function extractPrimaryTableTarget(sql: string): Promise<QueryTableTarget | null> {
  await getSqlParser()
  const { stmts } = await parseSql(sql)
  if (!stmts || stmts.length === 0) return null

  const root = stmts[0].stmt as Record<string, unknown>
  let node: Record<string, unknown> | undefined
  let type = Object.keys(root)[0]

  // Unwrap EXPLAIN to the inner statement
  if (type === 'ExplainStmt') {
    const inner = (root.ExplainStmt as { query?: Record<string, unknown> })?.query
    if (!inner) return null
    type = Object.keys(inner)[0]
    node = inner[type] as Record<string, unknown> | undefined
  } else {
    node = root[type] as Record<string, unknown> | undefined
  }

  if (!node) return null

  let rangeVar: { schemaname?: string; relname?: string } | null = null

  if (type === 'InsertStmt' || type === 'UpdateStmt' || type === 'DeleteStmt' || type === 'MergeStmt') {
    rangeVar = node.relation as { schemaname?: string; relname?: string } | null
  } else if (type === 'SelectStmt') {
    const fromClause = node.fromClause as Array<{ RangeVar?: { schemaname?: string; relname?: string } }> | undefined
    if (fromClause?.[0]?.RangeVar) {
      rangeVar = fromClause[0].RangeVar
    }
  }

  if (!rangeVar?.relname) return null
  return {
    schema: rangeVar.schemaname || 'public',
    table: rangeVar.relname,
  }
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

export function getSnippets(limit = 100, connectionName?: string) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100))
  const resolvedConnectionName = getConnectionByName(connectionName).name
  return metaDb
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
  metaDb
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
    const row = metaDb
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

  const result = metaDb
    .update(querySnippets)
    .set(values)
    .where(and(eq(querySnippets.id, id), eq(querySnippets.connectionName, resolvedConnectionName)))
    .run()
  if (!result.changes) return null

  const row = metaDb
    .select()
    .from(querySnippets)
    .where(and(eq(querySnippets.id, id), eq(querySnippets.connectionName, resolvedConnectionName)))
    .get()
  return row ? toSnippetRow(row) : null
}

export function deleteSnippet(id: string, connectionName?: string) {
  const resolvedConnectionName = getConnectionByName(connectionName).name
  metaDb
    .delete(querySnippets)
    .where(and(eq(querySnippets.id, id), eq(querySnippets.connectionName, resolvedConnectionName)))
    .run()
}

export async function executeQuery({
  query,
  connectionName,
  values,
}: {
  query: string
  connectionName?: string
  values?: unknown[]
}) {
  const connection = getConnectionByName(connectionName)
  const startedAt = new Date()
  const startedTs = Date.now()
  const historyId = randomUUID()

  const pool = getPool(connection.connectionString)

  try {
    const client = await pool.connect()
    try {
      if (connection.readOnly) {
        await client.query('set default_transaction_read_only = on')
      }
      const statements = await splitStatements(query)
      if (values && statements.length !== 1) {
        const error = new Error('Parameterized execution supports exactly one SQL statement') as Error & {
          statusCode?: number
        }
        error.statusCode = 400
        throw error
      }
      if (connection.readOnly) {
        let hasWrite = false
        for (const statement of statements) {
          if (await isWriteStatement(statement)) {
            hasWrite = true
            break
          }
        }
        if (hasWrite) {
          const error = new Error(`Connection '${connection.name}' is read-only`) as Error & {
            statusCode?: number
          }
          error.statusCode = 403
          throw error
        }
      }
      const results: Array<{
        command: string
        rowCount: number
        returnedRowCount: number
        truncated: boolean
        fields: string[]
        rows: Record<string, unknown>[]
        tableTarget: QueryTableTarget | null
      }> = []

      await client.query(`set statement_timeout = ${QUERY_STATEMENT_TIMEOUT_MS}`)

      for (const statement of statements) {
        const result = values
          ? await client.query({ text: statement, values })
          : await client.query(statement)
        const pgFields = result.fields.map((f: { name: string }) => f.name)
        const outputColumns = await extractSelectOutputColumnNames(statement)
        const rawRows =
          result.rows.length > MAX_RESULT_ROWS ? result.rows.slice(0, MAX_RESULT_ROWS) : result.rows
        const { fields, rows } = narrowResultToSelectList(
          pgFields,
          rawRows as Record<string, unknown>[],
          outputColumns,
        )
        results.push({
          command: result.command,
          rowCount: result.rowCount ?? 0,
          returnedRowCount: rows.length,
          truncated: result.rows.length > MAX_RESULT_ROWS,
          fields,
          rows,
          tableTarget: await extractPrimaryTableTarget(statement),
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
      if (connection.readOnly) {
        try {
          await client.query('set default_transaction_read_only = off')
        } catch {
          // Avoid masking original query errors during connection cleanup.
        }
      }
      try {
        await client.query('set statement_timeout = default')
      } catch {
        // Avoid masking original query errors during connection cleanup.
      }
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
    const pgCode = (error as { code?: string })?.code
    if (connection.readOnly && pgCode === '25006') {
      err.statusCode = 403
    } else if (pgCode === '57014') {
      err.message = `Query timed out after ${QUERY_STATEMENT_TIMEOUT_MS} ms`
      err.statusCode = 408
    } else {
      err.statusCode = (error as { statusCode?: number })?.statusCode || 400
    }
    throw err
  } finally {
    // Pools are intentionally reused across requests.
  }
}

async function getRelationKind(client: PoolClient, schema: string, table: string): Promise<RelationKind> {
  const sql = `
    select c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = $1
      and c.relname = $2
      and c.relkind in ('r', 'v', 'm')
    limit 1
  `
  const { rows } = await client.query(sql, [schema, table])
  const relkind = rows[0]?.relkind
  if (!relkind) {
    const error = new Error(`relation '${schema}.${table}' not found`) as Error & { statusCode?: number }
    error.statusCode = 404
    throw error
  }
  return mapPgRelkind(String(relkind))
}

async function assertMutableRelation(client: PoolClient, schema: string, table: string) {
  const kind = await getRelationKind(client, schema, table)
  if (!isMutableRelationKind(kind)) {
    const error = new Error(
      `relation '${schema}.${table}' is a ${kind}; row edits are not supported`
    ) as Error & {
      statusCode?: number
    }
    error.statusCode = 409
    throw error
  }
}

async function listRelations(connectionName: string | undefined, limit: number): Promise<TableInfo[]> {
  return withClient(connectionName, async (client) => {
    const sql = `
      select
        n.nspname as schema,
        c.relname as table,
        c.relkind as relkind,
        greatest(c.reltuples::bigint, 0)::bigint as estimated_rows
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'v', 'm')
        and n.nspname not in ('pg_catalog', 'information_schema')
      order by n.nspname, c.relkind, c.relname
      limit $1
    `
    const { rows } = await client.query(sql, [limit])
    return rows.map((row: Record<string, unknown>) => ({
      schema: String(row.schema || 'public'),
      table: String(row.table || ''),
      estimatedRows: Number(row.estimated_rows || 0),
      kind: mapPgRelkind(String(row.relkind || 'r')),
    }))
  })
}

const TABLE_LIST_LIMIT = 500

export async function listTables(connectionName?: string): Promise<{
  tables: TableInfo[]
  truncated: boolean
}> {
  const relations = await listRelations(connectionName, TABLE_LIST_LIMIT + 1)
  return {
    tables: relations.slice(0, TABLE_LIST_LIMIT),
    truncated: relations.length > TABLE_LIST_LIMIT,
  }
}

export async function getTableForeignKeys(
  connectionName: string | undefined,
  schema: string,
  table: string
): Promise<ForeignKeyConstraint[]> {
  return withClient(connectionName, async (client) => getTableForeignKeysForClient(client, schema, table))
}

async function getTableColumnsWithClient(
  client: PoolClient,
  schema: string,
  table: string
): Promise<TableColumn[]> {
  const primaryKeyColumns = await getPrimaryKeyColumns(client, schema, table)
  const primaryKeySet = new Set(primaryKeyColumns)
  const foreignKeys = await getTableForeignKeysForClient(client, schema, table)
  const foreignKeyByColumn = buildColumnForeignKeyMap(foreignKeys)
  const informationSchemaSql = `
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
    let { rows } = await client.query(informationSchemaSql, [schema, table])
    if (rows.length === 0) {
      const catalogSql = `
        select
          a.attname as column_name,
          pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
          not a.attnotnull as is_nullable,
          false as is_identity
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = $1
          and c.relname = $2
          and c.relkind in ('r', 'v', 'm')
          and a.attnum > 0
          and not a.attisdropped
        order by a.attnum
      `
      const catalogResult = await client.query(catalogSql, [schema, table])
      rows = catalogResult.rows
    }
    return rows.map((r: Record<string, unknown>) => {
      const name = String(r.column_name)
      const foreignKey = foreignKeyByColumn.get(name)
      return {
        name,
        dataType: String(r.data_type),
        isNullable: r.is_nullable === true || r.is_nullable === 'YES',
        isIdentity: r.is_identity === true || r.is_identity === 'YES',
        isPrimaryKey: primaryKeySet.has(name),
        ...(foreignKey ? { foreignKey } : {}),
      }
    })
}

export async function getTableColumns(
  connectionName: string | undefined,
  table: string,
  schema = 'public'
): Promise<TableColumn[]> {
  return withClient(connectionName, async (client) => getTableColumnsWithClient(client, schema, table))
}

export async function lookupTableRow(
  connectionName: string | undefined,
  schema: string,
  table: string,
  match: Record<string, unknown>
): Promise<{ row: Record<string, unknown> | null; columns: TableColumn[] }> {
  const matchKeys = Object.keys(match)
  if (matchKeys.length === 0) {
    const error = new Error('match must include at least one column') as Error & { statusCode?: number }
    error.statusCode = 400
    throw error
  }

  return withClient(connectionName, async (client) => {
    const columns = await getTableColumnsWithClient(client, schema, table)
    const columnByName = new Map(columns.map((column) => [column.name, column]))
    const unknownColumn = matchKeys.find((key) => !columnByName.has(key))
    if (unknownColumn) {
      const error = new Error(`unknown column '${unknownColumn}'`) as Error & { statusCode?: number }
      error.statusCode = 400
      throw error
    }

    const qTable = `${sqlIdent(schema)}.${sqlIdent(table)}`
    const whereParts = matchKeys.map((key, index) => `${sqlIdent(key)} = $${index + 1}`)
    const params = matchKeys.map((key) => match[key])
    const sql = `select * from ${qTable} where ${whereParts.join(' and ')} limit 1`
    const { rows } = await client.query(sql, params)
    const row = (rows[0] as Record<string, unknown> | undefined) ?? null
    return { row, columns }
  })
}

export async function getTableRows(
  connectionName: string | undefined,
  schema: string,
  table: string,
  options: {
    limit?: number
    offset?: number
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
    filterColumn?: string
    filterValue?: string
    filterValueEnd?: string
    filterMode?: TableFilterMode
    columns?: Array<{ name: string; dataType: string }>
  } = {}
) {
  return withClient(connectionName, async (client) => {
    const limit = Math.max(1, Math.min(500, Number(options.limit || 100)))
    const offset = Math.max(0, Number(options.offset || 0))
    const tableColumns = options.columns ?? (await getTableColumns(connectionName, table, schema))
    const columnNames = tableColumns.map((column) => column.name)
    const {
      sortBy: safeSortBy,
      filterColumn: safeFilterColumn,
      filterValue,
      filterValueEnd,
      filterMode: safeFilterMode,
      columnDataType,
    } = sanitizeRowsQueryOptions(tableColumns, options)
    const primaryKeyColumns = await getPrimaryKeyColumns(client, schema, table)
    const sortBy = safeSortBy ? sqlIdent(safeSortBy) : ''
    const sortOrder = options.sortOrder === 'desc' ? 'desc' : 'asc'
    const filterMode = safeFilterMode
    const filterColumn = safeFilterColumn ? sqlIdent(safeFilterColumn) : ''

    const qTable = `${sqlIdent(schema)}.${sqlIdent(table)}`
    const filter =
      filterColumn && hasActiveTableFilter(safeFilterColumn, filterMode, filterValue, filterValueEnd)
        ? buildTableRowFilter(filterColumn, filterMode, filterValue, columnDataType, filterValueEnd)
        : null
    const whereClause = filter?.whereClause ?? ''
    const params = filter?.params ?? []
    const defaultOrderClause =
      primaryKeyColumns.length > 0
        ? primaryKeyColumns.map((column) => `${sqlIdent(column)} asc`).join(', ')
        : columnNames.length > 0
          ? `${sqlIdent(columnNames[0])} asc`
          : ''
    const orderClause = sortBy ? `${sortBy} ${sortOrder}` : defaultOrderClause

    const sql = `
      select *
      from ${qTable}
      ${whereClause}
      ${orderClause ? `order by ${orderClause}` : ''}
      limit $${params.length + 1} offset $${params.length + 2}
    `
    const countSql = `select count(*)::bigint as total from ${qTable} ${whereClause}`
    const [rowsResult, countResult] = await Promise.all([
      client.query(sql, [...params, limit, offset]),
      client.query(countSql, params),
    ])
    return {
      rows: (rowsResult.rows as Record<string, unknown>[]).map((row) => ({
        ...row,
        _rowKey:
          primaryKeyColumns.length > 0
            ? Object.fromEntries(primaryKeyColumns.map((column) => [column, row[column]]))
            : null,
      })),
      total: Number(countResult.rows[0]?.total || 0),
    }
  })
}

export async function listSchemaObjects(connectionName?: string): Promise<SchemaTable[]> {
  return listRelations(connectionName, 2000)
}

export async function updateTableRowByPrimaryKey(
  connectionName: string | undefined,
  schema: string,
  table: string,
  rowKey: RowKey,
  patch: Record<string, unknown>
) {
  const connection = getConnectionByName(connectionName)
  if (connection.readOnly) {
    const error = new Error(`Connection '${connection.name}' is read-only`) as Error & { statusCode?: number }
    error.statusCode = 403
    throw error
  }
  const keys = Object.keys(patch)
  if (keys.length === 0) return

  return withClient(connectionName, async (client) => {
    await assertMutableRelation(client, schema, table)
    const primaryKeyColumns = await getPrimaryKeyColumns(client, schema, table)
    if (primaryKeyColumns.length === 0) {
      const error = new Error('table has no primary key') as Error & { statusCode?: number }
      error.statusCode = 409
      throw error
    }
    const missingPrimaryKey = primaryKeyColumns.find((column) => !(column in rowKey))
    if (missingPrimaryKey) {
      const error = new Error(`rowKey missing primary key column '${missingPrimaryKey}'`) as Error & {
        statusCode?: number
      }
      error.statusCode = 400
      throw error
    }
    const qTable = `${sqlIdent(schema)}.${sqlIdent(table)}`
    const setClause = keys.map((k, i) => `${sqlIdent(k)} = $${i + 1}`).join(', ')
    const values = keys.map((k) => patch[k])
    const whereClause = primaryKeyColumns
      .map((column, index) => `${sqlIdent(column)} = $${keys.length + index + 1}`)
      .join(' and ')
    const primaryKeyValues = primaryKeyColumns.map((column) => rowKey[column])
    const sql = `update ${qTable} set ${setClause} where ${whereClause}`
    const result = await client.query(sql, [...values, ...primaryKeyValues])
    if ((result.rowCount || 0) === 0) {
      const error = new Error('row not found') as Error & { statusCode?: number }
      error.statusCode = 404
      throw error
    }
  })
}

export async function insertTableRow(
  connectionName: string | undefined,
  schema: string,
  table: string,
  values: Record<string, unknown>
) {
  const connection = getConnectionByName(connectionName)
  if (connection.readOnly) {
    const error = new Error(`Connection '${connection.name}' is read-only`) as Error & { statusCode?: number }
    error.statusCode = 403
    throw error
  }

  const keys = Object.keys(values)
  if (keys.length === 0) {
    const error = new Error('at least one column value is required') as Error & { statusCode?: number }
    error.statusCode = 400
    throw error
  }

  return withClient(connectionName, async (client) => {
    await assertMutableRelation(client, schema, table)
    const columns = await getTableColumns(connectionName, table, schema)
    const columnByName = new Map(columns.map((column) => [column.name, column]))
    const unknownColumn = keys.find((key) => !columnByName.has(key))
    if (unknownColumn) {
      const error = new Error(`unknown column '${unknownColumn}'`) as Error & { statusCode?: number }
      error.statusCode = 400
      throw error
    }

    const identityColumn = keys.find((key) => columnByName.get(key)?.isIdentity)
    if (identityColumn) {
      const error = new Error(`cannot set identity column '${identityColumn}'`) as Error & {
        statusCode?: number
      }
      error.statusCode = 400
      throw error
    }

    const primaryKeyColumns = columns.filter((column) => column.isPrimaryKey).map((column) => column.name)
    const qTable = `${sqlIdent(schema)}.${sqlIdent(table)}`
    const columnList = keys.map((key) => sqlIdent(key)).join(', ')
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ')
    const sql = `insert into ${qTable} (${columnList}) values (${placeholders}) returning *`
    const { rows } = await client.query(
      sql,
      keys.map((key) => values[key])
    )
    const row = rows[0] as Record<string, unknown> | undefined
    if (!row) {
      const error = new Error('insert did not return a row') as Error & { statusCode?: number }
      error.statusCode = 500
      throw error
    }

    return {
      ...row,
      _rowKey:
        primaryKeyColumns.length > 0
          ? Object.fromEntries(primaryKeyColumns.map((column) => [column, row[column]]))
          : null,
    }
  })
}

export async function deleteTableRowByPrimaryKey(
  connectionName: string | undefined,
  schema: string,
  table: string,
  rowKey: RowKey
) {
  const connection = getConnectionByName(connectionName)
  if (connection.readOnly) {
    const error = new Error(`Connection '${connection.name}' is read-only`) as Error & { statusCode?: number }
    error.statusCode = 403
    throw error
  }
  return withClient(connectionName, async (client) => {
    await assertMutableRelation(client, schema, table)
    const primaryKeyColumns = await getPrimaryKeyColumns(client, schema, table)
    if (primaryKeyColumns.length === 0) {
      const error = new Error('table has no primary key') as Error & { statusCode?: number }
      error.statusCode = 409
      throw error
    }
    const missingPrimaryKey = primaryKeyColumns.find((column) => !(column in rowKey))
    if (missingPrimaryKey) {
      const error = new Error(`rowKey missing primary key column '${missingPrimaryKey}'`) as Error & {
        statusCode?: number
      }
      error.statusCode = 400
      throw error
    }
    const qTable = `${sqlIdent(schema)}.${sqlIdent(table)}`
    const whereClause = primaryKeyColumns
      .map((column, index) => `${sqlIdent(column)} = $${index + 1}`)
      .join(' and ')
    const primaryKeyValues = primaryKeyColumns.map((column) => rowKey[column])
    const sql = `delete from ${qTable} where ${whereClause}`
    const result = await client.query(sql, primaryKeyValues)
    if ((result.rowCount || 0) === 0) {
      const error = new Error('row not found') as Error & { statusCode?: number }
      error.statusCode = 404
      throw error
    }
  })
}
