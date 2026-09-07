import { notebookCells, notebooks } from '@/drizzle/schema'
import { getConnections } from '@/lib/db'
import type { NotebookCellType, Notebook } from '@/lib/notebook-types'
import {
  isWidgetMetadata,
  normalizeWidgetMetadata,
  type NotebookWidgetMetadata,
} from '@/lib/notebook-widgets'

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

/** An Error carrying the HTTP status `lib/api/errors` should send for it. */
export function notebookDbError(statusCode: number, message: string) {
  const error = new Error(message) as Error & { statusCode?: number }
  error.statusCode = statusCode
  return error
}

export function toNotebook(row: typeof notebooks.$inferSelect): Notebook {
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

export function toNotebookCell(row: typeof notebookCells.$inferSelect): NotebookCell {
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

export function getDefaultConnectionName() {
  const defaultConnection = getConnections().find((c) => c.isDefault)
  if (defaultConnection) return defaultConnection.name
  const first = getConnections()[0]
  if (!first) {
    throw notebookDbError(400, 'No database connection configured. Use Manage Connections to add one.')
  }
  return first.name
}

/**
 * Widget cells always persist normalized metadata. Anything that is not valid
 * widget metadata falls back to an empty info callout.
 */
export function widgetMetadataOrDefault(metadata: unknown): NotebookStoredWidgetMetadata {
  return normalizeWidgetMetadata(
    metadata && isWidgetMetadata(metadata)
      ? metadata
      : { widgetType: 'callout', config: { tone: 'info', title: 'Note', body: '' } }
  )
}
