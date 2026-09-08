import { randomUUID } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import { notebookCells, notebooks } from '@/drizzle/schema'
import { getMetaDb } from '@/lib/meta-db'
import type { NotebookCellType } from '@/lib/notebook-types'
import { normalizeWidgetMetadata } from '@/lib/notebook-widgets'
import {
  notebookDbError,
  toNotebookCell,
  widgetMetadataOrDefault,
  type NotebookStoredWidgetMetadata,
} from './shared'

function clampIndex(value: number, maxInclusive: number) {
  return Math.max(0, Math.min(maxInclusive, Math.floor(Number(value) || 0)))
}

function moveId<T>(items: T[], from: number, to: number) {
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * Rewrites `position` for every cell in `orderedCellIds` to its array index.
 * Positions are first parked above 1,000,000 so the intermediate states never
 * collide with each other.
 */
function applyCellOrder(tx: any, notebookId: string, orderedCellIds: string[], now: string) {
  for (const [index, id] of orderedCellIds.entries()) {
    tx.update(notebookCells)
      .set({ position: 1000000 + index, updatedAt: now })
      .where(eq(notebookCells.id, id))
      .run()
  }
  for (const [index, id] of orderedCellIds.entries()) {
    tx.update(notebookCells).set({ position: index, updatedAt: now }).where(eq(notebookCells.id, id)).run()
  }
  tx.update(notebooks).set({ updatedAt: now }).where(eq(notebooks.id, notebookId)).run()
}

export function createNotebookCell(input: {
  notebookId: string
  type: NotebookCellType
  content?: string
  metadata?: NotebookStoredWidgetMetadata | null
  position?: number
}) {
  const notebook = getMetaDb().select().from(notebooks).where(eq(notebooks.id, input.notebookId)).get()
  if (!notebook) throw notebookDbError(404, 'notebook not found')

  const rows = getMetaDb()
    .select()
    .from(notebookCells)
    .where(eq(notebookCells.notebookId, input.notebookId))
    .orderBy(asc(notebookCells.position))
    .all()
  const nextPosition = input.position === undefined ? rows.length : clampIndex(input.position, rows.length)

  const now = new Date().toISOString()
  const id = randomUUID()
  const metadata = input.type === 'widget' ? widgetMetadataOrDefault(input.metadata) : null
  getMetaDb().transaction((tx) => {
    tx.insert(notebookCells)
      .values({
        id,
        notebookId: input.notebookId,
        position: 1000000 + rows.length,
        type: input.type,
        content: input.content?.trim() ?? '',
        collapsed: false,
        metadataJson: metadata ? JSON.stringify(metadata) : null,
        updatedAt: now,
      })
      .run()
    const orderedCellIds = rows.map((row) => row.id)
    orderedCellIds.splice(nextPosition, 0, id)
    applyCellOrder(tx, input.notebookId, orderedCellIds, now)
  })

  const created = getMetaDb().select().from(notebookCells).where(eq(notebookCells.id, id)).get()
  if (!created) throw new Error('failed to create notebook cell')
  return toNotebookCell(created)
}

export function updateNotebookCell(
  notebookId: string,
  cellId: string,
  input: {
    type?: NotebookCellType
    content?: string
    collapsed?: boolean
    position?: number
    metadata?: NotebookStoredWidgetMetadata | null
  }
) {
  const existing = getMetaDb()
    .select()
    .from(notebookCells)
    .where(and(eq(notebookCells.id, cellId), eq(notebookCells.notebookId, notebookId)))
    .get()
  if (!existing) return null

  const now = new Date().toISOString()
  getMetaDb().transaction((tx) => {
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
    if (input.type !== undefined) {
      values.type = input.type
      if (input.type !== 'widget' && input.metadata === undefined) values.metadataJson = null
      // Run columns describe a SQL execution; a cell converted away from SQL has none.
      if (input.type !== 'sql' && existing.type === 'sql') {
        values.lastRunStatus = null
        values.lastRunAt = null
        values.lastDurationMs = null
        values.lastRowCount = null
        values.lastResultJson = null
        values.lastError = null
      }
    }
    if (input.content !== undefined) values.content = input.content
    if (input.collapsed !== undefined) values.collapsed = input.collapsed
    if (input.metadata !== undefined) {
      values.metadataJson =
        input.metadata === null ? null : JSON.stringify(normalizeWidgetMetadata(input.metadata))
    }
    if (input.type === 'widget' && input.metadata === undefined && !existing.metadataJson) {
      values.metadataJson = JSON.stringify(widgetMetadataOrDefault(null))
    }
    tx.update(notebookCells).set(values).where(eq(notebookCells.id, cellId)).run()
    tx.update(notebooks).set({ updatedAt: now }).where(eq(notebooks.id, notebookId)).run()
  })

  const updated = getMetaDb().select().from(notebookCells).where(eq(notebookCells.id, cellId)).get()
  return updated ? toNotebookCell(updated) : null
}

export function deleteNotebookCell(notebookId: string, cellId: string) {
  const existing = getMetaDb()
    .select()
    .from(notebookCells)
    .where(and(eq(notebookCells.id, cellId), eq(notebookCells.notebookId, notebookId)))
    .get()
  if (!existing) return false
  const now = new Date().toISOString()
  getMetaDb().transaction((tx) => {
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
