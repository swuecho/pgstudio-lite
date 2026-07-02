import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { tableForeignKeyDisplay } from '../../drizzle/schema'
import { metaDb } from '../meta-db'
import { getConnectionByName } from './connections'

export type ForeignKeyDisplayConfig = {
  connectionName: string
  schema: string
  table: string
  displayColumns: string[]
  displayTemplate: string | null
  updatedAt: string
}

function parseDisplayColumns(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

function toConfig(row: typeof tableForeignKeyDisplay.$inferSelect): ForeignKeyDisplayConfig {
  return {
    connectionName: row.connectionName,
    schema: row.schemaName,
    table: row.tableName,
    displayColumns: parseDisplayColumns(row.displayColumnsJson),
    displayTemplate: row.displayTemplate,
    updatedAt: row.updatedAt,
  }
}

export function getForeignKeyDisplayConfig(args: {
  connectionName?: string
  schema: string
  table: string
}): ForeignKeyDisplayConfig | null {
  const resolvedConnectionName = getConnectionByName(args.connectionName).name
  const row = metaDb
    .select()
    .from(tableForeignKeyDisplay)
    .where(
      and(
        eq(tableForeignKeyDisplay.connectionName, resolvedConnectionName),
        eq(tableForeignKeyDisplay.schemaName, args.schema),
        eq(tableForeignKeyDisplay.tableName, args.table)
      )
    )
    .get()
  return row ? toConfig(row) : null
}

export function saveForeignKeyDisplayConfig(args: {
  connectionName?: string
  schema: string
  table: string
  displayColumns: string[]
  displayTemplate?: string | null
}): ForeignKeyDisplayConfig {
  const resolvedConnectionName = getConnectionByName(args.connectionName).name
  const displayColumns = args.displayColumns.map((item) => item.trim()).filter(Boolean)
  if (displayColumns.length === 0) {
    throw new Error('displayColumns must include at least one column')
  }

  const now = new Date().toISOString()
  const existing = metaDb
    .select()
    .from(tableForeignKeyDisplay)
    .where(
      and(
        eq(tableForeignKeyDisplay.connectionName, resolvedConnectionName),
        eq(tableForeignKeyDisplay.schemaName, args.schema),
        eq(tableForeignKeyDisplay.tableName, args.table)
      )
    )
    .get()

  const values = {
    displayColumnsJson: JSON.stringify(displayColumns),
    displayTemplate: args.displayTemplate?.trim() || null,
    updatedAt: now,
  }

  if (existing) {
    metaDb
      .update(tableForeignKeyDisplay)
      .set(values)
      .where(eq(tableForeignKeyDisplay.id, existing.id))
      .run()
  } else {
    metaDb
      .insert(tableForeignKeyDisplay)
      .values({
        id: randomUUID(),
        connectionName: resolvedConnectionName,
        schemaName: args.schema,
        tableName: args.table,
        ...values,
        createdAt: now,
      })
      .run()
  }

  const saved = getForeignKeyDisplayConfig({
    connectionName: resolvedConnectionName,
    schema: args.schema,
    table: args.table,
  })
  if (!saved) throw new Error('failed to save foreign-key display config')
  return saved
}
