import { randomUUID } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import { dbConnections, notebooks, queryHistory, querySnippets } from '../../drizzle/schema'
import { metaDb } from '../meta-db'
import { closePool } from './pool'

export type DbConnection = {
  id: string
  name: string
  connectionString: string
  isDefault: boolean
  readOnly: boolean
  createdAt: string
  updatedAt: string
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

function closePoolIfUnused(connectionString: string) {
  const stillUsed = getConnections().some((connection) => connection.connectionString === connectionString)
  if (stillUsed) return
  closePool(connectionString)
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

export function resolveConnectionName(connectionName?: string) {
  return getResolvedConnectionName(connectionName)
}

export function getConnectionByName(connectionName?: string): DbConnection {
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
