import { getConnectionByName } from './connections'
import { withClient } from './client'
import { sqlIdent } from './sql'
import { assertMutableRelation, getTableColumns } from './introspect'

export async function importTableRows(
  connectionName: string | undefined,
  schema: string,
  table: string,
  columns: string[],
  rows: unknown[][]
): Promise<{ inserted: number }> {
  const connection = getConnectionByName(connectionName)
  if (connection.readOnly) {
    const error = new Error(`Connection '${connection.name}' is read-only`) as Error & { statusCode?: number }
    error.statusCode = 403
    throw error
  }

  if (columns.length === 0) {
    const error = new Error('at least one target column is required') as Error & { statusCode?: number }
    error.statusCode = 400
    throw error
  }
  if (rows.length === 0) return { inserted: 0 }

  return withClient(connectionName, async (client) => {
    await assertMutableRelation(client, schema, table)
    const tableColumns = await getTableColumns(connectionName, table, schema)
    const columnByName = new Map(tableColumns.map((column) => [column.name, column]))

    const unknownColumn = columns.find((column) => !columnByName.has(column))
    if (unknownColumn) {
      const error = new Error(`unknown column '${unknownColumn}'`) as Error & { statusCode?: number }
      error.statusCode = 400
      throw error
    }
    const identityColumn = columns.find((column) => columnByName.get(column)?.isIdentity)
    if (identityColumn) {
      const error = new Error(`cannot set identity column '${identityColumn}'`) as Error & {
        statusCode?: number
      }
      error.statusCode = 400
      throw error
    }

    const qTable = `${sqlIdent(schema)}.${sqlIdent(table)}`
    const columnList = columns.map((column) => sqlIdent(column)).join(', ')
    // PostgreSQL caps a statement at 65535 bind parameters; stay well under it.
    const batchSize = Math.max(1, Math.floor(5000 / columns.length))

    await client.query('begin')
    try {
      for (let start = 0; start < rows.length; start += batchSize) {
        const batch = rows.slice(start, start + batchSize)
        const params: unknown[] = []
        const tuples = batch.map((row) => {
          const placeholders = columns.map((_, colIndex) => {
            params.push(row[colIndex] ?? null)
            return `$${params.length}`
          })
          return `(${placeholders.join(', ')})`
        })
        const sql = `insert into ${qTable} (${columnList}) values ${tuples.join(', ')}`
        await client.query(sql, params)
      }
      await client.query('commit')
    } catch (error) {
      await client.query('rollback').catch(() => {})
      // Surface the database message (e.g. constraint violations) so the import
      // UI can show why it failed, rather than a generic 500.
      const pgError = error as { message?: string; detail?: string; statusCode?: number }
      const wrapped = new Error(
        pgError.detail ? `${pgError.message} (${pgError.detail})` : pgError.message || 'Import failed'
      ) as Error & { statusCode?: number }
      wrapped.statusCode = pgError.statusCode ?? 400
      throw wrapped
    }

    return { inserted: rows.length }
  })
}
