import {
  fetchRowsByMatch,
  getIncomingForeignKeys,
  getTableColumns,
  getTableForeignKeys,
  type ForeignKeyConstraint,
  type IncomingForeignKey,
  type TableColumn,
} from './db'

export type TraceNode = {
  schema: string
  table: string
  pk: Record<string, unknown> | null
  row: Record<string, unknown> | null
  parents: TraceEdge[]
  children: TraceEdge[]
  childrenTruncated: boolean
  childrenTotal: number
  depth: number
  /** True when this node references a row already shown elsewhere in the tree; it is not expanded further. */
  cycle: boolean
}

export type TraceEdge = {
  via: string
  direction: 'parent' | 'child'
  fkColumns: string[]
  referencedColumns: string[]
  referencedSchema: string
  referencedTable: string
  node: TraceNode
}

type Direction = 'root' | 'parent' | 'child'

type TraceContext = {
  connectionName?: string
  maxDepth: number
  childLimit: number
  visited: Set<string>
  columnsCache: Map<string, Promise<TableColumn[]>>
  outgoingFkCache: Map<string, Promise<ForeignKeyConstraint[]>>
  incomingFkCache: Map<string, Promise<IncomingForeignKey[]>>
}

function tableKey(schema: string, table: string): string {
  return `${schema}.${table}`
}

function visitedKey(schema: string, table: string, pk: Record<string, unknown> | null): string {
  return `${schema}.${table}#${pk ? JSON.stringify(pk) : '∅'}`
}

function getColumns(ctx: TraceContext, schema: string, table: string): Promise<TableColumn[]> {
  const key = tableKey(schema, table)
  let cached = ctx.columnsCache.get(key)
  if (!cached) {
    cached = getTableColumns(ctx.connectionName, table, schema)
    ctx.columnsCache.set(key, cached)
  }
  return cached
}

function getOutgoingFks(ctx: TraceContext, schema: string, table: string): Promise<ForeignKeyConstraint[]> {
  const key = tableKey(schema, table)
  let cached = ctx.outgoingFkCache.get(key)
  if (!cached) {
    cached = getTableForeignKeys(ctx.connectionName, schema, table)
    ctx.outgoingFkCache.set(key, cached)
  }
  return cached
}

function getIncomingFks(ctx: TraceContext, schema: string, table: string): Promise<IncomingForeignKey[]> {
  const key = tableKey(schema, table)
  let cached = ctx.incomingFkCache.get(key)
  if (!cached) {
    cached = getIncomingForeignKeys(ctx.connectionName, schema, table)
    ctx.incomingFkCache.set(key, cached)
  }
  return cached
}

function pickPrimaryKey(
  row: Record<string, unknown>,
  columns: Array<{ name: string; isPrimaryKey: boolean }>
): Record<string, unknown> | null {
  const pk: Record<string, unknown> = {}
  for (const column of columns) {
    if (column.isPrimaryKey) pk[column.name] = row[column.name]
  }
  return Object.keys(pk).length > 0 ? pk : null
}

function makeNode(
  schema: string,
  table: string,
  pk: Record<string, unknown> | null,
  row: Record<string, unknown> | null,
  depth: number,
  cycle = false
): TraceNode {
  return {
    schema,
    table,
    pk,
    row,
    parents: [],
    children: [],
    childrenTruncated: false,
    childrenTotal: 0,
    depth,
    cycle,
  }
}

async function buildNode(
  ctx: TraceContext,
  schema: string,
  table: string,
  pk: Record<string, unknown> | null,
  row: Record<string, unknown> | null,
  depth: number,
  direction: Direction
): Promise<TraceNode> {
  ctx.visited.add(visitedKey(schema, table, pk))
  const node = makeNode(schema, table, pk, row, depth)

  if (!row || depth >= ctx.maxDepth) return node

  // Directional traversal: a node reached by going up only continues upward,
  // and one reached by going down only continues downward. This prevents the
  // tree from bouncing back (e.g. order -> customer -> all of customer's other
  // orders), which otherwise explodes into sibling rows that look like recursion.
  const exploreParents = direction === 'root' || direction === 'parent'
  const exploreChildren = direction === 'root' || direction === 'child'

  if (exploreParents) {
    const outgoingFks = await getOutgoingFks(ctx, schema, table)
    for (const fk of outgoingFks) {
      const fkValues = fk.columns.map((col) => row[col])
      if (fkValues.some((value) => value == null)) continue
      try {
        const { rows } = await fetchRowsByMatch(
          ctx.connectionName,
          fk.referencedSchema,
          fk.referencedTable,
          fk.referencedColumns,
          fkValues,
          1
        )
        const parentRow = rows[0]
        if (!parentRow) continue
        const parentColumns = await getColumns(ctx, fk.referencedSchema, fk.referencedTable)
        const parentPk =
          pickPrimaryKey(parentRow, parentColumns) ??
          Object.fromEntries(fk.referencedColumns.map((col, index) => [col, fkValues[index]]))
        const childKey = visitedKey(fk.referencedSchema, fk.referencedTable, parentPk)
        const subTree = ctx.visited.has(childKey)
          ? makeNode(fk.referencedSchema, fk.referencedTable, parentPk, parentRow, depth + 1, true)
          : await buildNode(
              ctx,
              fk.referencedSchema,
              fk.referencedTable,
              parentPk,
              parentRow,
              depth + 1,
              'parent'
            )
        node.parents.push({
          via: fk.name,
          direction: 'parent',
          fkColumns: fk.columns,
          referencedColumns: fk.referencedColumns,
          referencedSchema: fk.referencedSchema,
          referencedTable: fk.referencedTable,
          node: subTree,
        })
      } catch {
        // Skip parents we can't resolve (orphan FKs, permissions, etc.).
      }
    }
  }

  if (pk && exploreChildren) {
    const incomingFks = await getIncomingFks(ctx, schema, table)
    for (const fk of incomingFks) {
      const values = fk.parentColumns.map((col) => row[col])
      if (values.some((value) => value == null)) continue
      try {
        const { rows: childRows, total } = await fetchRowsByMatch(
          ctx.connectionName,
          fk.childSchema,
          fk.childTable,
          fk.childColumns,
          values,
          ctx.childLimit
        )
        if (childRows.length === 0) continue
        const childColumns = await getColumns(ctx, fk.childSchema, fk.childTable)
        node.childrenTotal += total
        if (total > childRows.length) node.childrenTruncated = true
        for (const childRow of childRows) {
          const childPk = pickPrimaryKey(childRow, childColumns)
          const childKey = visitedKey(fk.childSchema, fk.childTable, childPk)
          const subTree = ctx.visited.has(childKey)
            ? makeNode(fk.childSchema, fk.childTable, childPk, childRow, depth + 1, true)
            : await buildNode(ctx, fk.childSchema, fk.childTable, childPk, childRow, depth + 1, 'child')
          node.children.push({
            via: fk.name,
            direction: 'child',
            fkColumns: fk.childColumns,
            referencedColumns: fk.parentColumns,
            referencedSchema: schema,
            referencedTable: table,
            node: subTree,
          })
        }
      } catch {
        // Skip incoming relationships we can't resolve.
      }
    }
  }

  return node
}

export async function traceRowLineage(input: {
  connectionName?: string
  schema: string
  table: string
  pk: Record<string, unknown>
  maxDepth?: number
  childLimit?: number
}): Promise<TraceNode> {
  const ctx: TraceContext = {
    connectionName: input.connectionName,
    maxDepth: Math.max(1, Math.min(6, input.maxDepth ?? 3)),
    childLimit: Math.max(1, Math.min(20, input.childLimit ?? 5)),
    visited: new Set<string>(),
    columnsCache: new Map(),
    outgoingFkCache: new Map(),
    incomingFkCache: new Map(),
  }

  const columns = await getColumns(ctx, input.schema, input.table)
  const { rows } = await fetchRowsByMatch(
    input.connectionName,
    input.schema,
    input.table,
    Object.keys(input.pk),
    Object.values(input.pk),
    1
  )
  const rootRow = rows[0]
  if (!rootRow) {
    const error = new Error('row not found') as Error & { statusCode?: number }
    error.statusCode = 404
    throw error
  }
  const pk = pickPrimaryKey(rootRow, columns) ?? input.pk
  return buildNode(ctx, input.schema, input.table, pk, rootRow, 0, 'root')
}
