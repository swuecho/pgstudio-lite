import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq } from 'drizzle-orm'
import { notebookCells, notebooks } from '../drizzle/schema'
import { executeQuery, getConnections } from './db'
import { metaDb } from './meta-db'
import { compileSqlTemplate, extractTemplateKeys } from './notebook-params'
import {
  getWidgetParamValues,
  isWidgetMetadata,
  normalizeWidgetMetadata,
  type NotebookWidgetMetadata,
} from './notebook-widgets'

import type { NotebookCellType, Notebook, NotebookSpecV1 } from './notebook-types'
export type { NotebookCellType, Notebook, NotebookSpecV1, NotebookSpecV1Cell } from './notebook-types'
export type NotebookStoredWidgetMetadata = NotebookWidgetMetadata

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
  metadata_json: NotebookStoredWidgetMetadata | null
  updated_at: string
}

function toNotebook(row: typeof notebooks.$inferSelect): Notebook {
  let parsedMetadata: Record<string, unknown> = {}
  if (row.metadataJson) {
    try {
      const value = JSON.parse(row.metadataJson) as unknown
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        parsedMetadata = value as Record<string, unknown>
      }
    } catch {
      parsedMetadata = {}
    }
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    metadata_json: parsedMetadata,
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
  let parsedMetadata: NotebookStoredWidgetMetadata | null = null
  if (row.metadataJson) {
    try {
      parsedMetadata = JSON.parse(row.metadataJson) as NotebookStoredWidgetMetadata
    } catch {
      parsedMetadata = null
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
    metadata_json: parsedMetadata,
    updated_at: row.updatedAt,
  }
}

function getDefaultConnectionName() {
  const defaultConnection = getConnections().find((c) => c.isDefault)
  if (defaultConnection) return defaultConnection.name
  const first = getConnections()[0]
  if (!first) {
    const error = new Error(
      'No database connection configured. Use Manage Connections to add one.'
    ) as Error & {
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
    tx.update(notebookCells).set({ position: index, updatedAt: now }).where(eq(notebookCells.id, id)).run()
  }
  tx.update(notebooks).set({ updatedAt: now }).where(eq(notebooks.id, notebookId)).run()
}

export function listNotebooks(limit = 200) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200))
  return metaDb
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
  metaDb
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
    ? metaDb.select().from(notebooks).where(eq(notebooks.id, input.targetNotebookId)).get()
    : null
  const existingBySpecId = spec.id
    ? metaDb.select().from(notebooks).where(eq(notebooks.id, spec.id)).get()
    : null

  let notebookId: string
  if (mode === 'create') {
    notebookId = randomUUID()
  } else if (mode === 'replace') {
    if (!input.targetNotebookId) throw new Error('target_notebook_id is required for replace mode')
    if (!existingByTarget) {
      const error = new Error('notebook not found') as Error & { statusCode?: number }
      error.statusCode = 404
      throw error
    }
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
  metaDb.transaction((tx) => {
    if (mode === 'create' && spec.id) {
      const existing = tx.select({ id: notebooks.id }).from(notebooks).where(eq(notebooks.id, spec.id)).get()
      if (existing) {
        const error = new Error('notebook already exists') as Error & { statusCode?: number }
        error.statusCode = 409
        throw error
      }
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
      const metadata =
        cell.type === 'widget'
          ? JSON.stringify(
              normalizeWidgetMetadata(
                cell.metadata && isWidgetMetadata(cell.metadata)
                  ? cell.metadata
                  : {
                      widgetType: 'callout',
                      config: { tone: 'info', title: 'Note', body: '' },
                    }
              )
            )
          : null
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
  if (!data) {
    const error = new Error('notebook not found') as Error & { statusCode?: number }
    error.statusCode = 404
    throw error
  }

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
  metadata?: NotebookStoredWidgetMetadata | null
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
  const metadata =
    input.type === 'widget'
      ? normalizeWidgetMetadata(
          input.metadata && isWidgetMetadata(input.metadata)
            ? input.metadata
            : {
                widgetType: 'callout',
                config: { tone: 'info', title: 'Note', body: '' },
              }
        )
      : null
  metaDb.transaction((tx) => {
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

  const created = metaDb.select().from(notebookCells).where(eq(notebookCells.id, id)).get()
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
    if (input.type !== undefined) {
      values.type = input.type
      if (input.type !== 'widget' && input.metadata === undefined) values.metadataJson = null
    }
    if (input.content !== undefined) values.content = input.content
    if (input.collapsed !== undefined) values.collapsed = input.collapsed
    if (input.metadata !== undefined) {
      values.metadataJson =
        input.metadata === null ? null : JSON.stringify(normalizeWidgetMetadata(input.metadata))
    }
    if (input.type === 'widget' && input.metadata === undefined && !existing.metadataJson) {
      values.metadataJson = JSON.stringify(
        normalizeWidgetMetadata({ widgetType: 'callout', config: { tone: 'info', title: 'Note', body: '' } })
      )
    }
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

export async function runNotebookSqlCell(input: {
  notebookId: string
  cellId: string
  query: string
  inputValues?: Record<string, unknown>
}) {
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
    const templateKeys = extractTemplateKeys(input.query)
    const notebookCellsWithMetadata = metaDb
      .select()
      .from(notebookCells)
      .where(eq(notebookCells.notebookId, input.notebookId))
      .all()
      .map(toNotebookCell)

    const widgetValueByKey = new Map<string, unknown>()
    for (const currentCell of notebookCellsWithMetadata) {
      const metadata = currentCell.metadata_json
      if (!metadata) continue
      if (currentCell.type === 'widget' && isWidgetMetadata(metadata)) {
        for (const [key, value] of Object.entries(getWidgetParamValues(metadata))) {
          widgetValueByKey.set(key, value)
        }
      }
    }

    let compiledQueryText = input.query
    let compiledValues: unknown[] | undefined
    if (templateKeys.length > 0) {
      const resolvedValues: Record<string, unknown> = {}
      for (const key of templateKeys) {
        if (widgetValueByKey.has(key)) {
          resolvedValues[key] = input.inputValues?.[key] ?? widgetValueByKey.get(key)
          continue
        }
        if (input.inputValues && key in input.inputValues) {
          resolvedValues[key] = input.inputValues[key]
          continue
        }
        const error = new Error(`Unknown input key '{{${key}}}'`) as Error & { statusCode?: number }
        error.statusCode = 400
        throw error
      }
      const compiled = compileSqlTemplate(input.query, resolvedValues)
      compiledQueryText = compiled.text
      compiledValues = compiled.values
    }

    const result = await executeQuery({
      query: compiledQueryText,
      connectionName: notebook.connectionName,
      values: compiledValues,
    })
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

export async function runNotebookOptionQuery(input: {
  notebookId: string
  query: string
  inputValues?: Record<string, unknown>
}) {
  const notebook = metaDb.select().from(notebooks).where(eq(notebooks.id, input.notebookId)).get()
  if (!notebook) {
    const error = new Error('notebook not found') as Error & { statusCode?: number }
    error.statusCode = 404
    throw error
  }

  const templateKeys = extractTemplateKeys(input.query)
  let compiledQueryText = input.query
  let compiledValues: unknown[] | undefined

  if (templateKeys.length > 0) {
    const resolvedValues: Record<string, unknown> = {}
    for (const key of templateKeys) {
      if (!(key in (input.inputValues || {}))) {
        const error = new Error(`Unknown input key '{{${key}}}'`) as Error & { statusCode?: number }
        error.statusCode = 400
        throw error
      }
      resolvedValues[key] = input.inputValues?.[key]
    }
    const compiled = compileSqlTemplate(input.query, resolvedValues)
    compiledQueryText = compiled.text
    compiledValues = compiled.values
  }

  return executeQuery({
    query: compiledQueryText,
    connectionName: notebook.connectionName,
    values: compiledValues,
  })
}
