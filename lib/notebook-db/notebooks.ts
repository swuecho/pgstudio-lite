import { randomUUID } from 'node:crypto'
import { asc, desc, eq } from 'drizzle-orm'
import { notebookCells, notebooks } from '@/drizzle/schema'
import { getMetaDb } from '@/lib/meta-db'
import { getDefaultConnectionName, toNotebook, toNotebookCell } from './shared'

export function listNotebooks(limit = 200) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200))
  return getMetaDb()
    .select()
    .from(notebooks)
    .orderBy(desc(notebooks.updatedAt))
    .limit(safeLimit)
    .all()
    .map(toNotebook)
}

export function createNotebook(input: { title: string; connectionName?: string }) {
  const title = input.title.trim()
  if (!title) throw new Error('title is required')
  const connectionName = input.connectionName?.trim() || getDefaultConnectionName()
  const description = ''
  const metadataJson = '{}'
  const now = new Date().toISOString()
  const id = randomUUID()
  getMetaDb()
    .insert(notebooks)
    .values({
      id,
      title,
      description,
      metadataJson,
      connectionName,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  const created = getMetaDb().select().from(notebooks).where(eq(notebooks.id, id)).get()
  if (!created) throw new Error('failed to create notebook')
  return toNotebook(created)
}

export function updateNotebook(id: string, input: { title?: string; connectionName?: string }) {
  const existing = getMetaDb().select().from(notebooks).where(eq(notebooks.id, id)).get()
  if (!existing) return null

  const nextTitle = input.title === undefined ? existing.title : input.title.trim()
  const nextConnectionName =
    input.connectionName === undefined ? existing.connectionName : input.connectionName.trim()

  if (!nextTitle) throw new Error('title cannot be empty')
  if (!nextConnectionName) throw new Error('connectionName cannot be empty')

  const now = new Date().toISOString()
  getMetaDb()
    .update(notebooks)
    .set({
      title: nextTitle,
      connectionName: nextConnectionName,
      updatedAt: now,
    })
    .where(eq(notebooks.id, id))
    .run()

  const updated = getMetaDb().select().from(notebooks).where(eq(notebooks.id, id)).get()
  return updated ? toNotebook(updated) : null
}

export function deleteNotebook(id: string) {
  const existing = getMetaDb().select({ id: notebooks.id }).from(notebooks).where(eq(notebooks.id, id)).get()
  if (!existing) return false
  getMetaDb().transaction((tx) => {
    tx.delete(notebookCells).where(eq(notebookCells.notebookId, id)).run()
    tx.delete(notebooks).where(eq(notebooks.id, id)).run()
  })
  return true
}

export function getNotebookById(id: string) {
  const notebook = getMetaDb().select().from(notebooks).where(eq(notebooks.id, id)).get()
  if (!notebook) return null
  const cells = getMetaDb()
    .select()
    .from(notebookCells)
    .where(eq(notebookCells.notebookId, id))
    .orderBy(asc(notebookCells.position))
    .all()
    .map(toNotebookCell)
  return { notebook: toNotebook(notebook), cells }
}
