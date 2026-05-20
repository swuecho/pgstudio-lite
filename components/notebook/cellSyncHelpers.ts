import type { QueryResult } from '../sql-editor/types'
import type { NotebookCell, NotebookWidgetMetadata } from './types'
import {
  getWidgetParamValues,
  normalizeWidgetMetadata,
  createDefaultWidgetMetadata,
} from '../../lib/notebook-widgets'
import type { WidgetValidationMessages } from '../../lib/notebook-widget-validation'

export function isSameValue(a: unknown, b: unknown) {
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b)
  if (a && b && typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b)
  return a === b
}

export function syncCellDraftState(input: {
  cells: NotebookCell[]
  previousDrafts: Record<string, string>
  previousServerContent: Record<string, string>
  pendingSavePayloads: Record<string, { content?: string; metadata?: NotebookWidgetMetadata | null }>
}) {
  const drafts: Record<string, string> = {}
  const serverContentByCell: Record<string, string> = {}

  for (const cell of input.cells) {
    const previousDraft = input.previousDrafts[cell.id]
    const previousServerContent = input.previousServerContent[cell.id]
    const hasPendingContentSave = input.pendingSavePayloads[cell.id]?.content !== undefined

    serverContentByCell[cell.id] = cell.content

    if (previousDraft === undefined) {
      drafts[cell.id] = cell.content
      continue
    }

    const draftStillMatchesPreviousServer =
      previousServerContent !== undefined && previousDraft === previousServerContent

    if (!hasPendingContentSave && draftStillMatchesPreviousServer) {
      drafts[cell.id] = cell.content
      continue
    }

    drafts[cell.id] = previousDraft
  }

  return { drafts, serverContentByCell }
}

export function syncWidgetDraftState(input: {
  cells: NotebookCell[]
  previousDrafts: Record<string, NotebookWidgetMetadata>
  previousServerMetadata: Record<string, NotebookWidgetMetadata>
  pendingSavePayloads: Record<string, { content?: string; metadata?: NotebookWidgetMetadata | null }>
}) {
  const drafts: Record<string, NotebookWidgetMetadata> = {}
  const serverMetadataByCell: Record<string, NotebookWidgetMetadata> = {}

  for (const cell of input.cells) {
    if (cell.type !== 'widget') continue

    const serverMetadata = getNormalizedWidgetMetadata(cell)
    const previousDraft = input.previousDrafts[cell.id]
    const previousServerMetadata = input.previousServerMetadata[cell.id]
    const hasPendingMetadataSave = input.pendingSavePayloads[cell.id]?.metadata !== undefined

    serverMetadataByCell[cell.id] = serverMetadata

    if (!previousDraft) {
      drafts[cell.id] = serverMetadata
      continue
    }

    const draftStillMatchesPreviousServer =
      previousServerMetadata !== undefined && isSameValue(previousDraft, previousServerMetadata)

    if (!hasPendingMetadataSave && draftStillMatchesPreviousServer) {
      drafts[cell.id] = serverMetadata
      continue
    }

    drafts[cell.id] = previousDraft
  }

  return { drafts, serverMetadataByCell }
}

export function syncCellResultState(input: {
  cells: NotebookCell[]
  previousResults: Record<string, QueryResult>
  previousServerResults: Record<string, QueryResult | null>
}) {
  const results: Record<string, QueryResult> = {}
  const serverResultsByCell: Record<string, QueryResult | null> = {}

  for (const cell of input.cells) {
    if (cell.type !== 'sql') continue

    const serverResult = cell.last_result_json ?? null
    const previousResult = input.previousResults[cell.id]
    const previousServerResult = input.previousServerResults[cell.id]

    serverResultsByCell[cell.id] = serverResult

    if (previousResult === undefined) {
      if (serverResult) {
        results[cell.id] = serverResult
      }
      continue
    }

    const resultStillMatchesPreviousServer =
      previousServerResult !== undefined && isSameValue(previousResult, previousServerResult)

    if (resultStillMatchesPreviousServer) {
      if (serverResult) {
        results[cell.id] = serverResult
      }
      continue
    }

    results[cell.id] = previousResult
  }

  return { results, serverResultsByCell }
}

export function syncExecutedQueryState(input: {
  cells: NotebookCell[]
  previousExecutedQueryByCell: Record<string, string>
  previousServerExecutedQueryByCell: Record<string, string>
}) {
  const executedQueryByCell: Record<string, string> = {}
  const serverExecutedQueryByCell: Record<string, string> = {}

  for (const cell of input.cells) {
    if (cell.type !== 'sql' || !cell.last_result_json) continue

    const serverExecutedQuery = cell.content
    const previousExecutedQuery = input.previousExecutedQueryByCell[cell.id]
    const previousServerExecutedQuery = input.previousServerExecutedQueryByCell[cell.id]

    serverExecutedQueryByCell[cell.id] = serverExecutedQuery

    if (previousExecutedQuery === undefined) {
      executedQueryByCell[cell.id] = serverExecutedQuery
      continue
    }

    if (previousExecutedQuery === previousServerExecutedQuery) {
      executedQueryByCell[cell.id] = serverExecutedQuery
      continue
    }

    executedQueryByCell[cell.id] = previousExecutedQuery
  }

  return { executedQueryByCell, serverExecutedQueryByCell }
}

export function clearPendingSaveCell(pendingSaveByCell: Record<string, boolean>, cellId: string) {
  if (!pendingSaveByCell[cellId]) return pendingSaveByCell
  const next = { ...pendingSaveByCell }
  delete next[cellId]
  return next
}

export function clearSaveError(saveErrorByCell: Record<string, string>, cellId: string) {
  if (!saveErrorByCell[cellId]) return saveErrorByCell
  const next = { ...saveErrorByCell }
  delete next[cellId]
  return next
}

export function getPendingSaveCount(pendingSaveByCell: Record<string, boolean>) {
  return Object.values(pendingSaveByCell).filter(Boolean).length
}

export function getPendingSaveEntries(
  pendingSavePayloads: Record<string, { content?: string; metadata?: NotebookWidgetMetadata | null }>
) {
  return Object.entries(pendingSavePayloads).map(([cellId, payload]) => ({ cellId, payload }))
}

export function getStaleResultByCell(input: {
  sortedCells: NotebookCell[]
  draftByCell: Record<string, string>
  resultsByCell: Record<string, QueryResult>
  lastExecutedQueryByCell: Record<string, string>
}) {
  const staleByCell: Record<string, boolean> = {}

  for (const cell of input.sortedCells) {
    if (cell.type !== 'sql') continue
    if (!input.resultsByCell[cell.id]) continue

    const currentQuery = (input.draftByCell[cell.id] ?? cell.content).trim()
    const lastExecutedQuery = (input.lastExecutedQueryByCell[cell.id] ?? '').trim()

    staleByCell[cell.id] = Boolean(lastExecutedQuery) && currentQuery !== lastExecutedQuery
  }

  return staleByCell
}

export function markQueuedCells(queuedRunByCell: Record<string, boolean>, cellIds: string[]) {
  if (!cellIds.length) return queuedRunByCell
  const next = { ...queuedRunByCell }
  for (const cellId of cellIds) next[cellId] = true
  return next
}

export function clearQueuedCells(queuedRunByCell: Record<string, boolean>, cellIds: string[]) {
  if (!cellIds.length) return queuedRunByCell
  const next = { ...queuedRunByCell }
  for (const cellId of cellIds) delete next[cellId]
  return next
}

export function getCellUiStateByCell(input: {
  sortedCells: NotebookCell[]
  pendingSaveByCell: Record<string, boolean>
  saveErrorByCell: Record<string, string>
  queuedRunByCell: Record<string, boolean>
  runningCellId: string
  staleResultByCell: Record<string, boolean>
}) {
  const stateByCell: Record<
    string,
    'idle' | 'saving' | 'save_failed' | 'queued' | 'running' | 'stale_result'
  > = {}

  for (const cell of input.sortedCells) {
    if (input.runningCellId === cell.id) {
      stateByCell[cell.id] = 'running'
      continue
    }
    if (input.pendingSaveByCell[cell.id]) {
      stateByCell[cell.id] = 'saving'
      continue
    }
    if (input.saveErrorByCell[cell.id]) {
      stateByCell[cell.id] = 'save_failed'
      continue
    }
    if (input.queuedRunByCell[cell.id]) {
      stateByCell[cell.id] = 'queued'
      continue
    }
    if (input.staleResultByCell[cell.id]) {
      stateByCell[cell.id] = 'stale_result'
      continue
    }
    stateByCell[cell.id] = 'idle'
  }

  return stateByCell
}

export function getChangedWidgetParamKeys(previous: NotebookWidgetMetadata, next: NotebookWidgetMetadata) {
  const previousParams = getWidgetParamValues(previous)
  const nextParams = getWidgetParamValues(next)
  const keys = new Set([...Object.keys(previousParams), ...Object.keys(nextParams)])

  return [...keys].filter((key) => !isSameValue(previousParams[key], nextParams[key]))
}

export function getWidgetParameterKeys(metadata: NotebookWidgetMetadata) {
  if (
    metadata.widgetType === 'text' ||
    metadata.widgetType === 'number' ||
    metadata.widgetType === 'date' ||
    metadata.widgetType === 'datetime-local' ||
    metadata.widgetType === 'checkbox' ||
    metadata.widgetType === 'select' ||
    metadata.widgetType === 'range' ||
    metadata.widgetType === 'multiselect' ||
    metadata.widgetType === 'radio-group'
  ) {
    return metadata.key ? [metadata.key] : []
  }

  if (metadata.widgetType === 'date-range') {
    return [metadata.config?.startKey?.trim(), metadata.config?.endKey?.trim()].filter(
      (item): item is string => Boolean(item)
    )
  }

  return []
}

export function getResetWidgetValue(metadata: NotebookWidgetMetadata) {
  if (
    metadata.widgetType === 'text' ||
    metadata.widgetType === 'number' ||
    metadata.widgetType === 'date' ||
    metadata.widgetType === 'datetime-local' ||
    metadata.widgetType === 'checkbox' ||
    metadata.widgetType === 'select' ||
    metadata.widgetType === 'range' ||
    metadata.widgetType === 'multiselect' ||
    metadata.widgetType === 'radio-group'
  ) {
    return metadata.defaultValue ?? metadata.value
  }

  if (metadata.widgetType === 'date-range') {
    return metadata.defaultValue ?? metadata.value
  }

  return undefined
}

export function pushValidationMessage(
  target: WidgetValidationMessages,
  field: keyof WidgetValidationMessages,
  message: string
) {
  if (!target[field]) target[field] = []
  target[field]!.push(message)
}

export function getNormalizedWidgetMetadata(cell: NotebookCell) {
  if (cell.metadata_json && typeof cell.metadata_json === 'object' && 'widgetType' in cell.metadata_json) {
    return normalizeWidgetMetadata(cell.metadata_json as NotebookWidgetMetadata) as NotebookWidgetMetadata
  }
  return createDefaultWidgetMetadata('callout') as NotebookWidgetMetadata
}
