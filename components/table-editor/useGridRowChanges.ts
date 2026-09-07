import { useState } from 'react'
import { formatRowKey, normalizeValueForComparison, previewValue, truncate } from './gridCellValues'
import type { RowData, RowKey } from './types'

export type GridDialogState = {
  title: string
  lines: string[]
  confirmLabel?: string
  cancelLabel?: string
  hideCancel?: boolean
  onConfirm: () => void
  onCancel?: () => void
}

/**
 * Stage a cell edit. Returns 'unchanged' when the value is equivalent to the
 * current one (so the editor can reset itself), or 'pending' when a
 * confirmation dialog has been opened. `onCancel` runs if the user dismisses.
 */
export type CommitRowChange = (
  row: RowData,
  column: string,
  nextValue: unknown,
  dataType: string,
  onCancel?: () => void
) => 'unchanged' | 'pending'

/**
 * Every write from the grid goes through a preview dialog. This hook owns that
 * dialog and the before/after comparison behind it.
 */
export function useGridRowChanges(input: {
  onUpdateCell: (rowKey: RowKey | null, column: string, value: unknown) => void
  onDeleteRow: (rowKey: RowKey | null) => void
}) {
  const [dialog, setDialog] = useState<GridDialogState | null>(null)

  const commitRowChange: CommitRowChange = (row, column, nextValue, dataType, onCancel) => {
    const previous = row[column]
    const prevNormalized = normalizeValueForComparison(previous, dataType)
    const nextNormalized = normalizeValueForComparison(nextValue, dataType)
    if (prevNormalized === nextNormalized) return 'unchanged'
    setDialog({
      title: 'Preview row change',
      lines: [
        `Row: ${formatRowKey(row._rowKey)}`,
        `Column: ${column}`,
        `Before: ${truncate(previewValue(previous))}`,
        `After: ${truncate(previewValue(nextValue))}`,
      ],
      confirmLabel: 'Apply',
      cancelLabel: 'Cancel',
      onConfirm: () => {
        input.onUpdateCell(row._rowKey, column, nextValue)
      },
      onCancel,
    })
    return 'pending'
  }

  const confirmDeleteRow = (row: RowData) => {
    const rowPreview = truncate(previewValue(row), 500)
    setDialog({
      title: 'Preview row delete',
      lines: [`Row: ${formatRowKey(row._rowKey)}`, `Data: ${rowPreview}`],
      confirmLabel: 'Delete row',
      cancelLabel: 'Cancel',
      onConfirm: () => input.onDeleteRow(row._rowKey),
    })
  }

  return { dialog, closeDialog: () => setDialog(null), commitRowChange, confirmDeleteRow }
}
