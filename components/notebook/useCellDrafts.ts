import { useEffect, useRef, useState } from 'react'
import type { NotebookCell, NotebookWidgetMetadata } from './types'
import { normalizeWidgetMetadata } from '@/lib/notebook-widgets'
import {
  getNormalizedWidgetMetadata,
  getResetWidgetValue,
  syncCellDraftState,
  syncWidgetDraftState,
} from './cellSyncHelpers'
import type { useCellAutoSave } from './useCellAutoSave'
import type { useReactiveRunner } from './useReactiveRunner'

/**
 * Owns the unsaved per-cell drafts: SQL/markdown text and widget metadata.
 * Reconciles them against the server copy whenever `cells` changes, and routes
 * every edit through auto-save (and, for widgets, the reactive runner).
 */
export function useCellDrafts(params: {
  cells: NotebookCell[]
  sortedCellsRef: { current: NotebookCell[] }
  autoSave: ReturnType<typeof useCellAutoSave>
  scheduleWidgetReactiveRuns: ReturnType<typeof useReactiveRunner>['scheduleWidgetReactiveRuns']
}) {
  const { cells, sortedCellsRef, autoSave, scheduleWidgetReactiveRuns } = params

  const [draftByCell, setDraftByCell] = useState<Record<string, string>>({})
  const [widgetDraftByCell, setWidgetDraftByCell] = useState<Record<string, NotebookWidgetMetadata>>({})
  // Mirror of widgetDraftByCell so handlers see the latest drafts even when
  // called from a stale closure (e.g. a memoized child).
  const widgetDraftByCellRef = useRef<Record<string, NotebookWidgetMetadata>>({})

  useEffect(() => {
    widgetDraftByCellRef.current = widgetDraftByCell
  }, [widgetDraftByCell])

  // --- Reconcile drafts with the server copy ---

  useEffect(() => {
    setDraftByCell((prev) => {
      const synced = syncCellDraftState({
        cells,
        previousDrafts: prev,
        previousServerContent: autoSave.lastSyncedContentByCellRef.current,
        pendingSavePayloads: autoSave.pendingSavePayloadRef.current,
      })
      autoSave.lastSyncedContentByCellRef.current = synced.serverContentByCell
      return synced.drafts
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells])

  useEffect(() => {
    setWidgetDraftByCell((prev) => {
      const synced = syncWidgetDraftState({
        cells,
        previousDrafts: prev,
        previousServerMetadata: autoSave.lastSyncedWidgetByCellRef.current,
        pendingSavePayloads: autoSave.pendingSavePayloadRef.current,
      })
      autoSave.lastSyncedWidgetByCellRef.current = synced.serverMetadataByCell
      return synced.drafts
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells])

  // --- Edits ---

  function onChangeCell(cell: NotebookCell, next: string) {
    setDraftByCell((prev) => ({ ...prev, [cell.id]: next }))
    autoSave.scheduleCellSave(cell, { content: next })
  }

  function onWidgetMetadataChange(cell: NotebookCell, next: NotebookWidgetMetadata) {
    const previous = widgetDraftByCellRef.current[cell.id] || getNormalizedWidgetMetadata(cell)
    const normalized = normalizeWidgetMetadata(next) as NotebookWidgetMetadata
    const nextDrafts = { ...widgetDraftByCellRef.current, [cell.id]: normalized }
    widgetDraftByCellRef.current = nextDrafts
    setWidgetDraftByCell(nextDrafts)
    autoSave.scheduleCellSave(cell, { metadata: normalized })

    scheduleWidgetReactiveRuns(cell.id, previous, normalized)
  }

  function updateParameterWidget(cellId: string, next: NotebookWidgetMetadata) {
    const cell = sortedCellsRef.current.find((item) => item.id === cellId)
    if (!cell || cell.type !== 'widget') return
    onWidgetMetadataChange(cell, next)
  }

  function resetParameterWidget(cellId: string) {
    const cell = sortedCellsRef.current.find((item) => item.id === cellId)
    if (!cell || cell.type !== 'widget') return
    const metadata = widgetDraftByCellRef.current[cell.id]
    if (!metadata) return
    const resetValue = getResetWidgetValue(metadata)
    if (resetValue === undefined) return
    onWidgetMetadataChange(cell, { ...metadata, value: resetValue })
  }

  return {
    draftByCell,
    widgetDraftByCell,
    widgetDraftByCellRef,
    onChangeCell,
    onWidgetMetadataChange,
    updateParameterWidget,
    resetParameterWidget,
  }
}
