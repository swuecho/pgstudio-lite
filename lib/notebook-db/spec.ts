import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { notebookCells, notebooks } from '@/drizzle/schema'
import { getMetaDb } from '@/lib/meta-db'
import type { NotebookCellType, NotebookSpecV1 } from '@/lib/notebook-types'
import { getNotebookById } from './notebooks'
import { getDefaultConnectionName, notebookDbError, widgetMetadataOrDefault } from './shared'

export function importNotebookSpecV1(input: {
  mode?: 'create' | 'replace' | 'upsert'
  targetNotebookId?: string
  notebook: NotebookSpecV1
  validateOnly?: boolean
}) {
  const mode = input.mode || 'create'
  const spec = input.notebook
  const warnings: string[] = []
  const description = (spec.description || '').trim()
  const metadata =
    spec.metadata && typeof spec.metadata === 'object' && !Array.isArray(spec.metadata) ? spec.metadata : {}
  const connectionName = spec.connection_name?.trim() || getDefaultConnectionName()
  const existingByTarget = input.targetNotebookId
    ? getMetaDb().select().from(notebooks).where(eq(notebooks.id, input.targetNotebookId)).get()
    : null
  const existingBySpecId = spec.id
    ? getMetaDb().select().from(notebooks).where(eq(notebooks.id, spec.id)).get()
    : null

  let notebookId: string
  if (mode === 'create') {
    notebookId = randomUUID()
  } else if (mode === 'replace') {
    if (!input.targetNotebookId) throw new Error('target_notebook_id is required for replace mode')
    if (!existingByTarget) throw notebookDbError(404, 'notebook not found')
    notebookId = input.targetNotebookId
  } else if (existingByTarget) {
    notebookId = existingByTarget.id
  } else if (existingBySpecId) {
    notebookId = existingBySpecId.id
  } else {
    notebookId = spec.id || randomUUID()
  }

  const sortedCells = [...spec.cells]
    .map((cell, index) => ({ ...cell, __index: index }))
    .sort((a, b) => {
      const ap = a.position === undefined ? a.__index : a.position
      const bp = b.position === undefined ? b.__index : b.position
      return ap - bp
    })

  if (input.validateOnly) {
    return {
      notebook_id: notebookId,
      warnings,
      notebook: exportNotebookSpecV1FromPayload({
        id: notebookId,
        title: spec.title,
        description,
        metadata,
        connectionName,
        cells: sortedCells.map((cell, position) => ({
          id: cell.id,
          position,
          type: cell.type,
          content: cell.content,
          collapsed: cell.collapsed ?? false,
          metadata: cell.metadata,
        })),
      }),
    }
  }

  const now = new Date().toISOString()
  getMetaDb().transaction((tx) => {
    if (mode === 'create' && spec.id) {
      const existing = tx.select({ id: notebooks.id }).from(notebooks).where(eq(notebooks.id, spec.id)).get()
      if (existing) throw notebookDbError(409, 'notebook already exists')
    }

    const exists = tx.select({ id: notebooks.id }).from(notebooks).where(eq(notebooks.id, notebookId)).get()
    if (!exists) {
      tx.insert(notebooks)
        .values({
          id: notebookId,
          title: spec.title.trim(),
          description,
          metadataJson: JSON.stringify(metadata),
          connectionName,
          createdAt: now,
          updatedAt: now,
        })
        .run()
    } else {
      tx.update(notebooks)
        .set({
          title: spec.title.trim(),
          description,
          metadataJson: JSON.stringify(metadata),
          connectionName,
          updatedAt: now,
        })
        .where(eq(notebooks.id, notebookId))
        .run()
    }

    tx.delete(notebookCells).where(eq(notebookCells.notebookId, notebookId)).run()

    for (const [position, cell] of sortedCells.entries()) {
      const metadata = cell.type === 'widget' ? JSON.stringify(widgetMetadataOrDefault(cell.metadata)) : null
      tx.insert(notebookCells)
        .values({
          id: cell.id,
          notebookId,
          position,
          type: cell.type,
          content: String(cell.content ?? ''),
          collapsed: cell.collapsed ?? false,
          metadataJson: metadata,
          updatedAt: now,
        })
        .run()
    }
  })

  return {
    notebook_id: notebookId,
    warnings,
    notebook: exportNotebookSpecV1ById(notebookId),
  }
}

function exportNotebookSpecV1FromPayload(input: {
  id: string
  title: string
  description: string
  metadata: Record<string, unknown>
  connectionName: string
  cells: Array<{
    id: string
    position: number
    type: NotebookCellType
    content: string
    collapsed: boolean
    metadata?: Record<string, unknown>
  }>
}): NotebookSpecV1 {
  return {
    spec_version: '1.0',
    id: input.id,
    title: input.title,
    description: input.description,
    connection_name: input.connectionName,
    metadata: input.metadata,
    cells: input.cells.map((cell) => ({
      id: cell.id,
      type: cell.type,
      position: cell.position,
      collapsed: cell.collapsed,
      content: cell.content,
      metadata: cell.type === 'widget' && cell.metadata ? cell.metadata : undefined,
    })),
  }
}

export function exportNotebookSpecV1ById(id: string): NotebookSpecV1 {
  const data = getNotebookById(id)
  if (!data) throw notebookDbError(404, 'notebook not found')

  return {
    spec_version: '1.0',
    id: data.notebook.id,
    title: data.notebook.title,
    description: data.notebook.description,
    connection_name: data.notebook.connection_name,
    metadata: data.notebook.metadata_json,
    cells: data.cells.map((cell) => ({
      id: cell.id,
      type: cell.type,
      position: cell.position,
      collapsed: cell.collapsed,
      content: cell.content,
      metadata: cell.type === 'widget' ? (cell.metadata_json ?? undefined) : undefined,
    })),
  }
}
