import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq } from 'drizzle-orm'
import { notebookCells, notebooks } from '../drizzle/schema'
import { executeQuery, getConnections } from './db'
import { metaDb } from './meta-db'

export type NotebookCellType = 'sql' | 'markdown'

export type Notebook = {
  id: string
  title: string
  connection_name: string
  created_at: string
  updated_at: string
}

export type NotebookCell = {
  id: string
  notebook_id: string
  position: number
  type: NotebookCellType
  content: string
  collapsed: boolean
  last_run_status: 'success' | 'error' | null
  last_run_at: string | null
  last_duration_ms: number | null
  last_row_count: number | null
  last_result_json: unknown | null
  last_error: string | null
  updated_at: string
}

function toNotebook(row: typeof notebooks.$inferSelect): Notebook {
  return {
    id: row.id,
    title: row.title,
    connection_name: row.connectionName,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

function toNotebookCell(row: typeof notebookCells.$inferSelect): NotebookCell {
  let parsedLastResult: unknown | null = null
  if (row.lastResultJson) {
    try {
      parsedLastResult = JSON.parse(row.lastResultJson)
    } catch {
      parsedLastResult = null
    }
  }

  return {
    id: row.id,
    notebook_id: row.notebookId,
    position: row.position,
    type: row.type as NotebookCellType,
    content: row.content,
    collapsed: row.collapsed,
    last_run_status: (row.lastRunStatus as 'success' | 'error' | null) ?? null,
    last_run_at: row.lastRunAt ?? null,
    last_duration_ms: row.lastDurationMs ?? null,
    last_row_count: row.lastRowCount ?? null,
    last_result_json: parsedLastResult,
    last_error: row.lastError ?? null,
    updated_at: row.updatedAt,
  }
}

function getDefaultConnectionName() {
  const defaultConnection = getConnections().find((c) => c.isDefault)
  if (defaultConnection) return defaultConnection.name
  const first = getConnections()[0]
  if (!first) {
    const error = new Error('No database connection configured. Use Manage Connections to add one.') as Error & {
      statusCode?: number
    }
    error.statusCode = 400
    throw error
  }
  return first.name
}

function clampIndex(value: number, maxInclusive: number) {
  return Math.max(0, Math.min(maxInclusive, Math.floor(Number(value) || 0)))
}

function moveId<T>(items: T[], from: number, to: number) {
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

function applyCellOrder(tx: any, notebookId: string, orderedCellIds: string[], now: string) {
  for (const [index, id] of orderedCellIds.entries()) {
    tx.update(notebookCells)
      .set({ position: 1000000 + index, updatedAt: now })
      .where(eq(notebookCells.id, id))
      .run()
  }
  for (const [index, id] of orderedCellIds.entries()) {
    tx.update(notebookCells)
      .set({ position: index, updatedAt: now })
      .where(eq(notebookCells.id, id))
      .run()
  }
  tx.update(notebooks).set({ updatedAt: now }).where(eq(notebooks.id, notebookId)).run()
}

export function listNotebooks(limit = 200) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200))
  return metaDb.select().from(notebooks).orderBy(desc(notebooks.updatedAt)).limit(safeLimit).all().map(toNotebook)
}

export function createNotebook(input: { title: string; connectionName?: string }) {
  const title = input.title.trim()
  if (!title) throw new Error('title is required')
  const connectionName = input.connectionName?.trim() || getDefaultConnectionName()
  const now = new Date().toISOString()
  const id = randomUUID()
  metaDb
    .insert(notebooks)
    .values({
      id,
      title,
      connectionName,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  const created = metaDb.select().from(notebooks).where(eq(notebooks.id, id)).get()
  if (!created) throw new Error('failed to create notebook')
  return toNotebook(created)
}

export function updateNotebook(id: string, input: { title?: string; connectionName?: string }) {
  const existing = metaDb.select().from(notebooks).where(eq(notebooks.id, id)).get()
  if (!existing) return null

  const nextTitle = input.title === undefined ? existing.title : input.title.trim()
  const nextConnectionName =
    input.connectionName === undefined ? existing.connectionName : input.connectionName.trim()

  if (!nextTitle) throw new Error('title cannot be empty')
  if (!nextConnectionName) throw new Error('connectionName cannot be empty')

  const now = new Date().toISOString()
  metaDb
    .update(notebooks)
    .set({
      title: nextTitle,
      connectionName: nextConnectionName,
      updatedAt: now,
    })
    .where(eq(notebooks.id, id))
    .run()

  const updated = metaDb.select().from(notebooks).where(eq(notebooks.id, id)).get()
  return updated ? toNotebook(updated) : null
}

export function deleteNotebook(id: string) {
  const existing = metaDb.select({ id: notebooks.id }).from(notebooks).where(eq(notebooks.id, id)).get()
  if (!existing) return false
  metaDb.transaction((tx) => {
    tx.delete(notebookCells).where(eq(notebookCells.notebookId, id)).run()
    tx.delete(notebooks).where(eq(notebooks.id, id)).run()
  })
  return true
}

export function getNotebookById(id: string) {
  const notebook = metaDb.select().from(notebooks).where(eq(notebooks.id, id)).get()
  if (!notebook) return null
  const cells = metaDb
    .select()
    .from(notebookCells)
    .where(eq(notebookCells.notebookId, id))
    .orderBy(asc(notebookCells.position))
    .all()
    .map(toNotebookCell)
  return { notebook: toNotebook(notebook), cells }
}

export function createNotebookCell(input: {
  notebookId: string
  type: NotebookCellType
  content?: string
  position?: number
}) {
  const notebook = metaDb.select().from(notebooks).where(eq(notebooks.id, input.notebookId)).get()
  if (!notebook) {
    const error = new Error('notebook not found') as Error & { statusCode?: number }
    error.statusCode = 404
    throw error
  }

  const rows = metaDb
    .select()
    .from(notebookCells)
    .where(eq(notebookCells.notebookId, input.notebookId))
    .orderBy(asc(notebookCells.position))
    .all()
  const nextPosition = input.position === undefined ? rows.length : clampIndex(input.position, rows.length)

  const now = new Date().toISOString()
  const id = randomUUID()
  metaDb.transaction((tx) => {
    tx.insert(notebookCells)
      .values({
        id,
        notebookId: input.notebookId,
        position: 1000000 + rows.length,
        type: input.type,
        content: input.content?.trim() ?? '',
        collapsed: false,
        updatedAt: now,
      })
      .run()
    const orderedCellIds = rows.map((row) => row.id)
    orderedCellIds.splice(nextPosition, 0, id)
    applyCellOrder(tx, input.notebookId, orderedCellIds, now)
  })

  const created = metaDb.select().from(notebookCells).where(eq(notebookCells.id, id)).get()
  if (!created) throw new Error('failed to create notebook cell')
  return toNotebookCell(created)
}

export function updateNotebookCell(
  notebookId: string,
  cellId: string,
  input: { type?: NotebookCellType; content?: string; collapsed?: boolean; position?: number }
) {
  const existing = metaDb
    .select()
    .from(notebookCells)
    .where(and(eq(notebookCells.id, cellId), eq(notebookCells.notebookId, notebookId)))
    .get()
  if (!existing) return null

  const now = new Date().toISOString()
  metaDb.transaction((tx) => {
    if (input.position !== undefined) {
      const rows = tx
        .select()
        .from(notebookCells)
        .where(eq(notebookCells.notebookId, notebookId))
        .orderBy(asc(notebookCells.position))
        .all()
      const orderedCellIds = rows.map((row) => row.id)
      const from = orderedCellIds.indexOf(cellId)
      const to = clampIndex(input.position, Math.max(0, rows.length - 1))
      if (from !== -1 && from !== to) {
        applyCellOrder(tx, notebookId, moveId(orderedCellIds, from, to), now)
      }
    }

    const values: Partial<typeof notebookCells.$inferInsert> = { updatedAt: now }
    if (input.type !== undefined) values.type = input.type
    if (input.content !== undefined) values.content = input.content
    if (input.collapsed !== undefined) values.collapsed = input.collapsed
    tx.update(notebookCells).set(values).where(eq(notebookCells.id, cellId)).run()
    tx.update(notebooks).set({ updatedAt: now }).where(eq(notebooks.id, notebookId)).run()
  })

  const updated = metaDb.select().from(notebookCells).where(eq(notebookCells.id, cellId)).get()
  return updated ? toNotebookCell(updated) : null
}

export function deleteNotebookCell(notebookId: string, cellId: string) {
  const existing = metaDb
    .select()
    .from(notebookCells)
    .where(and(eq(notebookCells.id, cellId), eq(notebookCells.notebookId, notebookId)))
    .get()
  if (!existing) return false
  const now = new Date().toISOString()
  metaDb.transaction((tx) => {
    tx.delete(notebookCells).where(eq(notebookCells.id, cellId)).run()
    const orderedCellIds = tx
      .select()
      .from(notebookCells)
      .where(eq(notebookCells.notebookId, notebookId))
      .orderBy(asc(notebookCells.position))
      .all()
      .map((row: typeof notebookCells.$inferSelect) => row.id)
    applyCellOrder(tx, notebookId, orderedCellIds, now)
  })
  return true
}

export async function runNotebookSqlCell(input: { notebookId: string; cellId: string; query: string }) {
  const notebook = metaDb.select().from(notebooks).where(eq(notebooks.id, input.notebookId)).get()
  if (!notebook) {
    const error = new Error('notebook not found') as Error & { statusCode?: number }
    error.statusCode = 404
    throw error
  }
  const cell = metaDb
    .select()
    .from(notebookCells)
    .where(and(eq(notebookCells.id, input.cellId), eq(notebookCells.notebookId, input.notebookId)))
    .get()
  if (!cell) {
    const error = new Error('cell not found') as Error & { statusCode?: number }
    error.statusCode = 404
    throw error
  }
  if (cell.type !== 'sql') {
    const error = new Error('only sql cells can be executed') as Error & { statusCode?: number }
    error.statusCode = 400
    throw error
  }

  const now = new Date().toISOString()
  try {
    const result = await executeQuery({ query: input.query, connectionName: notebook.connectionName })
    metaDb
      .update(notebookCells)
      .set({
        lastRunStatus: 'success',
        lastRunAt: now,
        lastDurationMs: result.durationMs,
        lastRowCount: result.totalRows,
        lastResultJson: JSON.stringify(result),
        lastError: null,
        updatedAt: now,
      })
      .where(eq(notebookCells.id, input.cellId))
      .run()
    metaDb.update(notebooks).set({ updatedAt: now }).where(eq(notebooks.id, input.notebookId)).run()
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    metaDb
      .update(notebookCells)
      .set({
        lastRunStatus: 'error',
        lastRunAt: now,
        lastDurationMs: null,
        lastRowCount: null,
        lastResultJson: null,
        lastError: message,
        updatedAt: now,
      })
      .where(eq(notebookCells.id, input.cellId))
      .run()
    metaDb.update(notebooks).set({ updatedAt: now }).where(eq(notebooks.id, input.notebookId)).run()
    throw error
  }
}
