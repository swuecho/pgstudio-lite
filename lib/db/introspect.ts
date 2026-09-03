import { isMutableRelationKind, mapPgRelkind, type RelationKind } from '../relation-kind'
import { parsePgStringArray } from '../pg-array'
import { withClient } from './client'
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

export async function assertMutableRelation(client: PoolClient, schema: string, table: string) {
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

export async function getTableColumnsWithClient(
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

export async function listSchemaObjects(connectionName?: string): Promise<SchemaTable[]> {
  return listRelations(connectionName, 2000)
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
