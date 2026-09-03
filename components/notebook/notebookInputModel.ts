import type { NotebookCell, NotebookWidgetMetadata } from './types'
import { extractTemplateKeys } from '@/lib/notebook-params'
import { isInputLikeWidgetType } from '@/lib/notebook-widgets'
import {
  countWidgetValidationMessages,
  getWidgetValidationMessages,
  type WidgetValidationMessages,
} from '@/lib/notebook-widget-validation'
import { getWidgetParameterKeys, pushValidationMessage } from './cellSyncHelpers'

/**
 * Pure derivations over the notebook's cells and the current widget drafts.
 * These feed the parameter panel, the "insert parameter" menu, and per-cell
 * validation. Keeping them out of the hook makes them unit-testable and keeps
 * the hook down to state and effects.
 */

export type NotebookInputDescriptor = { key: string; label: string; inputType: string }

export type ParameterWidget = {
  cell: NotebookCell
  metadata: NotebookWidgetMetadata
  parameterKeys: string[]
  primaryKey: string
  source: 'sql' | 'manual'
  validationMessages: WidgetValidationMessages
  validationCount: number
  usedByCellIds: string[]
}

type WidgetDraftByCell = Record<string, NotebookWidgetMetadata>

function listWidgetDrafts(sortedCells: NotebookCell[], widgetDraftByCell: WidgetDraftByCell) {
  const out: Array<{ cell: NotebookCell; metadata: NotebookWidgetMetadata }> = []
  for (const cell of sortedCells) {
    if (cell.type !== 'widget') continue
    const metadata = widgetDraftByCell[cell.id]
    if (!metadata) continue
    out.push({ cell, metadata })
  }
  return out
}

export function getNotebookInputs(
  sortedCells: NotebookCell[],
  widgetDraftByCell: WidgetDraftByCell
): NotebookInputDescriptor[] {
  const params: NotebookInputDescriptor[] = []

  for (const { metadata } of listWidgetDrafts(sortedCells, widgetDraftByCell)) {
    if (isInputLikeWidgetType(metadata.widgetType)) {
      if (!metadata.key) continue
      params.push({
        key: metadata.key,
        label: metadata.label || metadata.key,
        inputType: metadata.widgetType,
      })
      continue
    }

    if (metadata.widgetType === 'radio-group' && metadata.key) {
      params.push({
        key: metadata.key,
        label: metadata.label || metadata.key,
        inputType: 'widget-radio',
      })
      continue
    }

    if (metadata.widgetType === 'date-range') {
      const startKey = metadata.config?.startKey?.trim()
      const endKey = metadata.config?.endKey?.trim()
      if (startKey) {
        params.push({
          key: startKey,
          label: `${metadata.label || 'Date Range'} Start`,
          inputType: 'widget-date',
        })
      }
      if (endKey) {
        params.push({
          key: endKey,
          label: `${metadata.label || 'Date Range'} End`,
          inputType: 'widget-date',
        })
      }
    }
  }

  return params
}

export function getInputCellIdByKey(
  sortedCells: NotebookCell[],
  widgetDraftByCell: WidgetDraftByCell
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { cell, metadata } of listWidgetDrafts(sortedCells, widgetDraftByCell)) {
    if (metadata.key) out[metadata.key] = cell.id
    if (metadata.widgetType === 'date-range') {
      const startKey = metadata.config?.startKey?.trim()
      const endKey = metadata.config?.endKey?.trim()
      if (startKey) out[startKey] = cell.id
      if (endKey) out[endKey] = cell.id
    }
  }
  return out
}

export function getValidationMessagesByCell(
  sortedCells: NotebookCell[],
  widgetDraftByCell: WidgetDraftByCell
): Record<string, WidgetValidationMessages> {
  const drafts = listWidgetDrafts(sortedCells, widgetDraftByCell)
  const out: Record<string, WidgetValidationMessages> = {}
  const duplicateKeys = new Map<string, string[]>()

  for (const { cell, metadata } of drafts) {
    for (const key of getWidgetParameterKeys(metadata)) {
      const next = duplicateKeys.get(key) || []
      next.push(cell.id)
      duplicateKeys.set(key, next)
    }
  }

  for (const { cell, metadata } of drafts) {
    const extraMessages: WidgetValidationMessages = {}
    for (const key of getWidgetParameterKeys(metadata)) {
      const owners = duplicateKeys.get(key) || []
      if (owners.length < 2) continue
      const message = `Parameter key '${key}' is already used by another widget`
      if (metadata.widgetType === 'date-range') {
        if (metadata.config?.startKey === key) pushValidationMessage(extraMessages, 'startKey', message)
        if (metadata.config?.endKey === key) pushValidationMessage(extraMessages, 'endKey', message)
      } else {
        pushValidationMessage(extraMessages, 'key', message)
      }
    }

    out[cell.id] = getWidgetValidationMessages(metadata, extraMessages)
  }

  return out
}

export function getParameterWidgets(input: {
  sortedCells: NotebookCell[]
  widgetDraftByCell: WidgetDraftByCell
  draftByCell: Record<string, string>
  validationMessagesByCell: Record<string, WidgetValidationMessages>
}): ParameterWidget[] {
  const { sortedCells, widgetDraftByCell, draftByCell, validationMessagesByCell } = input
  const sqlCells = sortedCells.filter((item) => item.type === 'sql')

  return listWidgetDrafts(sortedCells, widgetDraftByCell).flatMap(({ cell, metadata }) => {
    const paramKeys = getWidgetParameterKeys(metadata)
    if (!paramKeys.length) return []

    const usedByCellIds = sqlCells
      .filter((item) => {
        const query = draftByCell[item.id] ?? item.content
        const templateKeys = extractTemplateKeys(query)
        return paramKeys.some((key) => templateKeys.includes(key))
      })
      .map((item) => item.id)

    const validationMessages = validationMessagesByCell[cell.id] || {}
    return [
      {
        cell,
        metadata,
        parameterKeys: paramKeys,
        primaryKey: paramKeys[0],
        source: metadata.config?.optionSource === 'sql' ? 'sql' : 'manual',
        validationMessages,
        validationCount: countWidgetValidationMessages(validationMessages),
        usedByCellIds,
      },
    ]
  })
}
