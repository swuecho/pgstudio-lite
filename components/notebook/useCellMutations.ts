import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { NotebookCell, NotebookCellType, NotebookWidgetMetadata } from './types'
import { createCell, deleteCell, updateCell } from '@/features/notebook/notebook.service'
import {
  createDefaultWidgetMetadata,
  createWidgetMetadataFromPreset,
  type NotebookWidgetPresetId,
} from '@/lib/notebook-widgets'
import { getNormalizedWidgetMetadata } from './cellSyncHelpers'

/** The cell types a cell can be converted between; widgets hold metadata, not text, so they stay put. */
export type ConvertibleCellType = Exclude<NotebookCellType, 'widget'>

/**
 * Server mutations on cells within the active notebook: add, duplicate, convert,
 * delete, reorder, collapse. Each one reports to the status bar and invalidates
 * the notebook detail query on success.
 */
export function useCellMutations(params: {
  activeNotebookId: string
  setStatus: (value: string) => void
  sortedCells: NotebookCell[]
  selectedCellId: string
  setSelectedCellId: (cellId: string) => void
  draftByCellRef: { current: Record<string, string> }
  widgetDraftByCellRef: { current: Record<string, NotebookWidgetMetadata> }
}) {
  const {
    activeNotebookId,
    setStatus,
    sortedCells,
    selectedCellId,
    setSelectedCellId,
    draftByCellRef,
    widgetDraftByCellRef,
  } = params
  const queryClient = useQueryClient()
  const [cellPendingDelete, setCellPendingDelete] = useState<NotebookCell | null>(null)

  function reportError(error: unknown) {
    setStatus(error instanceof Error ? error.message : String(error))
  }

  function invalidateNotebook() {
    void queryClient.invalidateQueries({ queryKey: ['notebook', activeNotebookId] })
  }

  function currentContent(cell: NotebookCell) {
    return draftByCellRef.current[cell.id] ?? cell.content
  }

  /** New cells land directly under the selected cell, or at the end when nothing is selected. */
  function positionAfterSelectedCell() {
    const selectedIndex = sortedCells.findIndex((cell) => cell.id === selectedCellId)
    return selectedIndex === -1 ? undefined : selectedIndex + 1
  }

  function selectCreatedCell(message: string) {
    return (data: { item: { id: string } }) => {
      setStatus(message)
      setSelectedCellId(data.item.id)
      if (activeNotebookId) invalidateNotebook()
    }
  }

  const addCellMutation = useMutation({
    mutationFn: (type: NotebookCellType) => {
      const position = positionAfterSelectedCell()
      if (type === 'sql') return createCell(activeNotebookId, { type, content: 'select now();', position })
      if (type === 'markdown') return createCell(activeNotebookId, { type, content: '## Notes\n', position })
      return createCell(activeNotebookId, {
        type: 'widget',
        metadata: createDefaultWidgetMetadata('text') as NotebookWidgetMetadata,
        position,
      })
    },
    onSuccess: selectCreatedCell('Cell added'),
    onError: reportError,
  })

  const addWidgetPresetMutation = useMutation({
    mutationFn: (presetId: NotebookWidgetPresetId) =>
      createCell(activeNotebookId, {
        type: 'widget',
        metadata: createWidgetMetadataFromPreset(presetId) as NotebookWidgetMetadata,
        position: positionAfterSelectedCell(),
      }),
    onSuccess: selectCreatedCell('Widget preset added'),
    onError: reportError,
  })

  /** Copies the cell as it is on screen (unsaved draft included) directly below the source. */
  const duplicateCellMutation = useMutation({
    mutationFn: (cellId: string) => {
      const sourceCell = sortedCells.find((cell) => cell.id === cellId)
      if (!sourceCell) throw new Error('cell not found')
      const position = sourceCell.position + 1
      if (sourceCell.type === 'widget') {
        const metadata = widgetDraftByCellRef.current[cellId] || getNormalizedWidgetMetadata(sourceCell)
        return createCell(activeNotebookId, { type: 'widget', metadata, position })
      }
      return createCell(activeNotebookId, {
        type: sourceCell.type,
        content: currentContent(sourceCell),
        position,
      })
    },
    onSuccess: selectCreatedCell('Cell duplicated'),
    onError: reportError,
  })

  const deleteCellMutation = useMutation({
    mutationFn: (cellId: string) => deleteCell(activeNotebookId, cellId),
    onSuccess: (_, cellId) => {
      setStatus('Cell deleted')
      // Keep the selection where the user was working so the next Add lands there.
      const index = sortedCells.findIndex((cell) => cell.id === cellId)
      const neighbour = sortedCells[index + 1] ?? sortedCells[index - 1]
      if (neighbour) setSelectedCellId(neighbour.id)
      if (activeNotebookId) invalidateNotebook()
    },
    onError: reportError,
  })

  function moveCell(cell: NotebookCell, direction: 'up' | 'down') {
    const to = direction === 'up' ? cell.position - 1 : cell.position + 1
    if (to < 0 || to >= sortedCells.length) return
    void updateCell(activeNotebookId, { cellId: cell.id, position: to })
      .then(() => {
        setStatus('Cell reordered')
        invalidateNotebook()
      })
      .catch(reportError)
  }

  function toggleCellCollapsed(cell: NotebookCell) {
    void updateCell(activeNotebookId, { cellId: cell.id, collapsed: !cell.collapsed })
      .then(() => {
        setStatus(cell.collapsed ? 'Cell expanded' : 'Cell collapsed')
        invalidateNotebook()
      })
      .catch(reportError)
  }

  /**
   * Switches a text cell between SQL and Markdown, keeping its text. The draft
   * travels with the request so an unsaved edit is not lost to the type change.
   */
  function convertCellType(cell: NotebookCell, nextType: ConvertibleCellType) {
    if (cell.type === 'widget' || cell.type === nextType) return
    void updateCell(activeNotebookId, { cellId: cell.id, type: nextType, content: currentContent(cell) })
      .then(() => {
        setStatus(nextType === 'sql' ? 'Converted to SQL' : 'Converted to Markdown')
        invalidateNotebook()
      })
      .catch(reportError)
  }

  /** Empty text cells go straight away; anything with content (or any widget) asks first. */
  function isCellEmpty(cell: NotebookCell) {
    if (cell.type === 'widget') return false
    return !currentContent(cell).trim()
  }

  function requestDeleteCell(cell: NotebookCell) {
    if (isCellEmpty(cell)) {
      deleteCellMutation.mutate(cell.id)
      return
    }
    setCellPendingDelete(cell)
  }

  function confirmDeleteCell() {
    if (!cellPendingDelete) return
    deleteCellMutation.mutate(cellPendingDelete.id)
    setCellPendingDelete(null)
  }

  function cancelDeleteCell() {
    setCellPendingDelete(null)
  }

  function duplicateCellById(cellId: string) {
    duplicateCellMutation.mutate(cellId)
  }

  return {
    addCellMutation,
    addWidgetPresetMutation,
    duplicateCellMutation,
    deleteCellMutation,
    cellPendingDelete,
    moveCell,
    toggleCellCollapsed,
    convertCellType,
    requestDeleteCell,
    confirmDeleteCell,
    cancelDeleteCell,
    duplicateCellById,
  }
}
