import { randomUUID } from 'node:crypto'
import { parseSql } from '../pg-parser'
import { extractSelectOutputColumnNames, narrowResultToSelectList } from '../query-output-columns'
import { queryHistory } from '../../drizzle/schema'
import { metaDb } from '../meta-db'
import { getConnectionByName } from './connections'
import { getPool } from './pool'
import { getPrimaryKeyColumns } from './tables'

const QUERY_STATEMENT_TIMEOUT_MS = 15_000
const MAX_RESULT_ROWS = 500

type QueryTableTarget = {
  schema: string
  table: string
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
  'InsertStmt',
  'UpdateStmt',
  'DeleteStmt',
  'MergeStmt',
  'CreateStmt',
  'CreateSchemaStmt',
  'CreateFunctionStmt',
  'CreatePLangStmt',
  'CreateTableAsStmt',
  'CreateSeqStmt',
  'CreateRoleStmt',
  'CreateTrigStmt',
  'CreateCastStmt',
  'CreateOpClassStmt',
  'CreateOpFamilyStmt',
  'CreateConversionStmt',
  'CreateDomainStmt',
  'CreateExtensionStmt',
  'CreateFdwStmt',
  'CreateForeignServerStmt',
  'CreateForeignTableStmt',
  'CreatePolicyStmt',
  'CreatePublicationStmt',
  'CreateStatsStmt',
  'CreateSubStmt',
  'CreateTransformStmt',
  'CreateAmStmt',
  'CreateUserMappingStmt',
  'IndexStmt',
  'ViewStmt',
  'RuleStmt',
  'AlterTableStmt',
  'AlterDomainStmt',
  'AlterFunctionStmt',
  'AlterObjectDependsStmt',
  'AlterObjectSchemaStmt',
  'AlterOwnerStmt',
  'AlterOperatorStmt',
  'AlterTypeStmt',
  'AlterPolicyStmt',
  'AlterSeqStmt',
  'AlterSystemStmt',
  'AlterTSConfigStmt',
  'AlterTSDictStmt',
  'AlterCollationStmt',
  'AlterFdwStmt',
  'AlterForeignServerStmt',
  'AlterDefaultPrivilegesStmt',
  'AlterExtensionStmt',
  'AlterExtensionContentsStmt',
  'AlterPublicationStmt',
  'AlterSubStmt',
  'AlterRoleStmt',
  'AlterStatsStmt',
  'AlterOpFamilyStmt',
  'RenameStmt',
  'DropStmt',
  'TruncateStmt',
  'GrantStmt',
  'CommentStmt',
  'VacuumStmt',
  'ReindexStmt',
  'ClusterStmt',
  'RefreshMatViewStmt',
  'CallStmt',
  'DoStmt',
  'CopyStmt',
  'ListenStmt',
  'NotifyStmt',
  'UnlistenStmt',
  'DiscardStmt',
  'DefineStmt',
  'CompositeTypeStmt',
  'SecLabelStmt',
  'ImportForeignSchemaStmt',
  'CheckPointStmt',
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
    const fromClause = node.fromClause as
      | Array<{ RangeVar?: { schemaname?: string; relname?: string } }>
      | undefined
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
        tableTargetPrimaryKey: string[]
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
          outputColumns
        )
        const tableTarget = await extractPrimaryTableTarget(statement)
        let tableTargetPrimaryKey: string[] = []
        if (tableTarget) {
          try {
            tableTargetPrimaryKey = await getPrimaryKeyColumns(client, tableTarget.schema, tableTarget.table)
          } catch {
            // Target may be a view/CTE without a resolvable primary key; skip.
          }
        }
        results.push({
          command: result.command,
          rowCount: result.rowCount ?? 0,
          returnedRowCount: rows.length,
          truncated: result.rows.length > MAX_RESULT_ROWS,
          fields,
          rows,
          tableTarget,
          tableTargetPrimaryKey,
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
  }
}
