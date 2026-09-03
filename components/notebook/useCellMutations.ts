import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { NotebookCell, NotebookCellType, NotebookWidgetMetadata } from './types'
import { createCell, deleteCell, updateCell } from '@/features/notebook/notebook.service'
import {
  createDefaultWidgetMetadata,
  createWidgetMetadataFromPreset,
  type NotebookWidgetPresetId,
} from '@/lib/notebook-widgets'
import { getNormalizedWidgetMetadata } from './cellSyncHelpers'

/**
 * Server mutations on cells within the active notebook: add, duplicate, delete,
 * reorder, collapse. Each one reports to the status bar and invalidates the
 * notebook detail query on success.
 */
export function useCellMutations(params: {
  activeNotebookId: string
  setStatus: (value: string) => void
  sortedCells: NotebookCell[]
  selectedCellId: string
  setSelectedCellId: (cellId: string) => void
  widgetDraftByCellRef: { current: Record<string, NotebookWidgetMetadata> }
}) {
  const {
    activeNotebookId,
    setStatus,
    sortedCells,
    selectedCellId,
    setSelectedCellId,
    widgetDraftByCellRef,
  } = params
  const queryClient = useQueryClient()

  function reportError(error: unknown) {
    setStatus(error instanceof Error ? error.message : String(error))
  }

  function invalidateNotebook() {
    void queryClient.invalidateQueries({ queryKey: ['notebook', activeNotebookId] })
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

  const duplicateWidgetMutation = useMutation({
    mutationFn: (cellId: string) => {
      const sourceCell = sortedCells.find((cell) => cell.id === cellId)
      if (!sourceCell || sourceCell.type !== 'widget') {
        throw new Error('widget cell not found')
      }
      const metadata = widgetDraftByCellRef.current[cellId] || getNormalizedWidgetMetadata(sourceCell)
      return createCell(activeNotebookId, {
        type: 'widget',
        metadata,
        position: sourceCell.position + 1,
      })
    },
    onSuccess: selectCreatedCell('Widget duplicated'),
    onError: reportError,
  })

  const deleteCellMutation = useMutation({
    mutationFn: (cellId: string) => deleteCell(activeNotebookId, cellId),
    onSuccess: () => {
      setStatus('Cell deleted')
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

  function deleteCellById(cellId: string) {
    deleteCellMutation.mutate(cellId)
  }

  function duplicateWidgetCellById(cellId: string) {
    duplicateWidgetMutation.mutate(cellId)
  }

  return {
    addCellMutation,
    addWidgetPresetMutation,
    duplicateWidgetMutation,
    deleteCellMutation,
    moveCell,
    toggleCellCollapsed,
    deleteCellById,
    duplicateWidgetCellById,
  }
}
