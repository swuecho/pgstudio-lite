import { randomUUID } from 'node:crypto'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { notebookCells, notebooks } from '@/drizzle/schema'
import { getMetaDb } from '@/lib/meta-db'
import type { NotebookCellType, NotebookSpecV1, NotebookSpecV1Cell } from '@/lib/notebook-types'
import { getNotebookById } from './notebooks'
import { getDefaultConnectionName, notebookDbError, widgetMetadataOrDefault } from './shared'

/** Positions are parked here while cells are rewritten so the unique (notebook, position) index never trips. */
const PARKED_POSITION_BASE = 1000000

/**
 * Cell ids are the primary key of `notebook_cells`, shared by every notebook.
 * Agent-written specs reuse readable ids such as `md_intro`, so importing the
 * same spec into a second notebook would collide. Ids already taken by a
 * *different* notebook are swapped for fresh UUIDs (and `targetCellIds` on
 * action widgets follow); ids inside the target notebook itself stay stable.
 */
function remapCollidingCellIds(
  cells: NotebookSpecV1Cell[],
  notebookId: string,
  warnings: string[]
): NotebookSpecV1Cell[] {
  const specIds = cells.map((cell) => cell.id)
  if (!specIds.length) return cells
  const taken = getMetaDb()
    .select({ id: notebookCells.id })
    .from(notebookCells)
    .where(and(inArray(notebookCells.id, specIds), ne(notebookCells.notebookId, notebookId)))
    .all()
  if (!taken.length) return cells

  const idMap = new Map<string, string>()
  for (const row of taken) {
    const nextId = randomUUID()
    idMap.set(row.id, nextId)
    warnings.push(`cell id '${row.id}' is already used by another notebook; imported as '${nextId}'`)
  }

  return cells.map((cell) => {
    const id = idMap.get(cell.id) ?? cell.id
    const targetCellIds =
      cell.metadata?.config && (cell.metadata.config as Record<string, unknown>).targetCellIds
    if (!Array.isArray(targetCellIds) || !targetCellIds.some((item) => idMap.has(String(item)))) {
      return id === cell.id ? cell : { ...cell, id }
    }
    const config = cell.metadata!.config as Record<string, unknown>
    return {
      ...cell,
      id,
      metadata: {
        ...cell.metadata,
        config: {
          ...config,
          targetCellIds: targetCellIds.map((item) => idMap.get(String(item)) ?? item),
        },
      },
    }
  })
}

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

  const sortedCells = remapCollidingCellIds(
    [...spec.cells]
      .map((cell, index) => ({ ...cell, __index: index }))
      .sort((a, b) => {
        const ap = a.position === undefined ? a.__index : a.position
        const bp = b.position === undefined ? b.__index : b.position
        return ap - bp
      }),
    notebookId,
    warnings
  )

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

    // Reconcile cells in place rather than delete-and-reinsert: a cell whose id
    // survives keeps its run columns (last status, error, stored result), so a
    // JSON Patch that only renames the notebook does not blank every result.
    const existingCells = tx
      .select()
      .from(notebookCells)
      .where(eq(notebookCells.notebookId, notebookId))
      .orderBy(notebookCells.position)
      .all() as Array<typeof notebookCells.$inferSelect>
    const existingById = new Map(existingCells.map((row) => [row.id, row]))
    const specIds = new Set(sortedCells.map((cell) => cell.id))

    const removedIds = existingCells.filter((row) => !specIds.has(row.id)).map((row) => row.id)
    if (removedIds.length) {
      tx.delete(notebookCells).where(inArray(notebookCells.id, removedIds)).run()
    }
    for (const [index, row] of existingCells.filter((item) => specIds.has(item.id)).entries()) {
      tx.update(notebookCells)
        .set({ position: PARKED_POSITION_BASE + index })
        .where(eq(notebookCells.id, row.id))
        .run()
    }

    for (const [position, cell] of sortedCells.entries()) {
      const metadataJson =
        cell.type === 'widget' ? JSON.stringify(widgetMetadataOrDefault(cell.metadata)) : null
      const content = String(cell.content ?? '')
      const collapsed = cell.collapsed ?? false
      const existing = existingById.get(cell.id)

      if (!existing) {
        tx.insert(notebookCells)
          .values({
            id: cell.id,
            notebookId,
            position,
            type: cell.type,
            content,
            collapsed,
            metadataJson,
            updatedAt: now,
          })
          .run()
        continue
      }

      const unchanged =
        existing.type === cell.type &&
        existing.content === content &&
        existing.collapsed === collapsed &&
        existing.metadataJson === metadataJson
      // Results only make sense on a SQL cell; a type change drops them. A
      // content edit keeps them, matching the editor, which shows the stored
      // result as stale until the cell is run again.
      const keepRunColumns = cell.type === 'sql' && existing.type === 'sql'
      tx.update(notebookCells)
        .set({
          position,
          type: cell.type,
          content,
          collapsed,
          metadataJson,
          updatedAt: unchanged ? existing.updatedAt : now,
          ...(keepRunColumns
            ? {}
            : {
                lastRunStatus: null,
                lastRunAt: null,
                lastDurationMs: null,
                lastRowCount: null,
                lastResultJson: null,
                lastError: null,
              }),
        })
        .where(eq(notebookCells.id, cell.id))
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
