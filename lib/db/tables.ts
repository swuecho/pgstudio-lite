import { isMutableRelationKind, mapPgRelkind, type RelationKind } from '../relation-kind'
import { buildTableRowFilter, hasActiveTableFilter, type TableFilterMode } from '../table-filter'
import { parsePgStringArray } from '../pg-array'
import { sanitizeRowsQueryOptions } from '../table-query-options'
import { getConnectionByName } from './connections'
import { withClient } from './client'
import { sqlIdent } from './sql'
import type { PoolClient } from './pool'

export type { RelationKind } from '../relation-kind'

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
  hasDefault: boolean
  foreignKey?: ColumnForeignKey
}

export type SchemaTable = {
  schema: string
  table: string
  estimatedRows: number
  kind: RelationKind
}

export type IncomingForeignKey = {
  name: string
  childSchema: string
  childTable: string
  childColumns: string[]
  parentColumns: string[]
}

type RowKey = Record<string, unknown>

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

function buildColumnForeignKeyMap(constraints: ForeignKeyConstraint[]): Map<string, ColumnForeignKey> {
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

export async function getPrimaryKeyColumns(
  client: PoolClient,
  schema: string,
  table: string
): Promise<string[]> {
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
      is_identity,
      column_default
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
        false as is_identity,
        a.atthasdef as column_default
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
      hasDefault: r.column_default !== null && r.column_default !== undefined && r.column_default !== false,
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

export async function getIncomingForeignKeys(
  connectionName: string | undefined,
  schema: string,
  table: string
): Promise<IncomingForeignKey[]> {
  return withClient(connectionName, async (client) => {
    const sql = `
      select
        c.conname                     as constraint_name,
        n.nspname                     as child_schema,
        cl.relname                    as child_table,
        json_agg(a.attname order by u.ord)  as child_columns,
        json_agg(af.attname order by u.ord) as parent_columns
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_class cf on cf.oid = c.confrelid
      join pg_namespace nf on nf.oid = cf.relnamespace
      join unnest(c.conkey, c.confkey) with ordinality as u(attnum, refattnum, ord) on true
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = u.attnum and not a.attisdropped
      join pg_attribute af on af.attrelid = c.confrelid and af.attnum = u.refattnum and not af.attisdropped
      where c.contype = 'f'
        and nf.nspname = $1
        and cf.relname = $2
      group by c.conname, n.nspname, cl.relname
      order by c.conname
    `
    const { rows } = await client.query(sql, [schema, table])
    return rows.map((row: Record<string, unknown>) => ({
      name: String(row.constraint_name),
      childSchema: String(row.child_schema),
      childTable: String(row.child_table),
      childColumns: parsePgStringArray(row.child_columns),
      parentColumns: parsePgStringArray(row.parent_columns),
    }))
  })
}

const FK_LABEL_TYPE_HINTS = ['char', 'text', 'name', 'citext']

function isLabelLikeType(dataType: string): boolean {
  const type = dataType.toLowerCase()
  return FK_LABEL_TYPE_HINTS.some((hint) => type.includes(hint))
}

export type ForeignKeyOption = {
  value: unknown
  label: string
  selected?: boolean
}

function toForeignKeyOption(row: Record<string, unknown>, hasLabelColumn: boolean): ForeignKeyOption {
  const value = row.value
  const label =
    hasLabelColumn && row.label !== null && row.label !== undefined ? String(row.label) : String(value)
  return { value, label }
}

/**
 * Lists candidate values for a foreign-key column by reading the referenced
 * table's key column (plus a best-effort human-readable label column). Used by
 * the insert-row form so a FK field can be picked from existing values.
 */
export async function getForeignKeyOptions(
  connectionName: string | undefined,
  schema: string,
  table: string,
  column: string,
  search: string,
  limit: number,
  selectedValue?: string
): Promise<{ options: ForeignKeyOption[]; truncated: boolean }> {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50))
  return withClient(connectionName, async (client) => {
    const columns = await getTableColumnsWithClient(client, schema, table)
    if (!columns.some((c) => c.name === column)) {
      const error = new Error(`unknown column '${column}'`) as Error & { statusCode?: number }
      error.statusCode = 400
      throw error
    }
    const labelColumn = columns.find((c) => c.name !== column && isLabelLikeType(c.dataType))?.name

    const qTable = `${sqlIdent(schema)}.${sqlIdent(table)}`
    const qValue = sqlIdent(column)
    const qLabel = labelColumn ? sqlIdent(labelColumn) : null
    const selectList = qLabel ? `${qValue} as value, ${qLabel} as label` : `${qValue} as value`
    const hasLabelColumn = Boolean(qLabel)

    const params: unknown[] = []
    const whereParts = [`${qValue} is not null`]
    const trimmed = search.trim()
    if (trimmed) {
      const searchTargets = qLabel ? [`${qValue}::text`, `${qLabel}::text`] : [`${qValue}::text`]
      params.push(`%${trimmed}%`)
      whereParts.push(`(${searchTargets.map((target) => `${target} ilike $${params.length}`).join(' or ')})`)
    }

    const sql = `
      select distinct ${selectList}
      from ${qTable}
      where ${whereParts.join(' and ')}
      order by ${qLabel ? 'label, value' : 'value'}
      limit ${safeLimit + 1}
    `
    const { rows } = await client.query(sql, params)
    const truncated = rows.length > safeLimit
    const options: ForeignKeyOption[] = rows
      .slice(0, safeLimit)
      .map((row: Record<string, unknown>) => toForeignKeyOption(row, hasLabelColumn))
    const trimmedSelectedValue = selectedValue?.trim()

    if (trimmedSelectedValue) {
      const selectedResult = await client.query(
        `
          select ${selectList}
          from ${qTable}
          where ${qValue}::text = $1
          limit 1
        `,
        [trimmedSelectedValue]
      )
      const selectedRow = selectedResult.rows[0]
      if (selectedRow) {
        const selectedOption = {
          ...toForeignKeyOption(selectedRow, hasLabelColumn),
          selected: true,
        }
        const selectedOptionValue = String(selectedOption.value)
        const remainingOptions = options.filter((option) => String(option.value) !== selectedOptionValue)
        return { options: [selectedOption, ...remainingOptions], truncated }
      }
    }

    return { options, truncated }
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
