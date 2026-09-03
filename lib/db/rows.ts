import { buildTableRowFilter, hasActiveTableFilter, type TableFilterMode } from '../table-filter'
import { sanitizeRowsQueryOptions } from '../table-query-options'
import { getConnectionByName } from './connections'
import { withClient } from './client'
import { sqlIdent } from './sql'
import {
  assertMutableRelation,
  getPrimaryKeyColumns,
  getTableColumns,
  getTableColumnsWithClient,
  type TableColumn,
} from './introspect'

type RowKey = Record<string, unknown>

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

export async function fetchRowsByMatch(
  connectionName: string | undefined,
  schema: string,
  table: string,
  matchColumns: string[],
  values: unknown[],
  limit: number
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  if (matchColumns.length === 0 || matchColumns.length !== values.length) {
    return { rows: [], total: 0 }
  }
  const safeLimit = Math.max(1, Math.min(50, limit))
  return withClient(connectionName, async (client) => {
    const qTable = `${sqlIdent(schema)}.${sqlIdent(table)}`
    const whereClause = matchColumns.map((col, index) => `${sqlIdent(col)} = $${index + 1}`).join(' and ')
    const dataSql = `select * from ${qTable} where ${whereClause} limit ${safeLimit}`
    const countSql = `select count(*)::bigint as total from ${qTable} where ${whereClause}`
    const [dataResult, countResult] = await Promise.all([
      client.query(dataSql, values),
      client.query(countSql, values),
    ])
    return {
      rows: dataResult.rows as Record<string, unknown>[],
      total: Number(countResult.rows[0]?.total || 0),
    }
  })
}
