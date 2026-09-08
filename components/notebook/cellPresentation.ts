import type { NotebookCell, NotebookCellUiState } from './types'

/** One-line SQL preview for collapsed cells and run-target labels. */
export function toCompactSqlPreview(sql: string) {
  const flattened = sql.replace(/\s+/g, ' ').trim()
  if (!flattened) return '-- Empty SQL cell --'
  return flattened.length > 180 ? `${flattened.slice(0, 180)}...` : flattened
}

export function formatCellUiState(state: NotebookCellUiState) {
  if (state === 'saving') return 'Saving...'
  if (state === 'save_failed') return 'Save failed'
  if (state === 'queued') return 'Queued'
  if (state === 'running') return 'Running...'
  if (state === 'stale_result') return 'Result is stale'
  return 'Idle'
}

/** Confirmation text for deleting a cell, naming what is about to go. */
export function describeCellForDelete(cell: NotebookCell, draft?: string) {
  const label = `#${cell.position + 1}`
  if (cell.type === 'widget') {
    const metadata = cell.metadata_json
    const name = metadata?.label || metadata?.key || metadata?.widgetType || 'widget'
    return `Delete widget cell ${label} (${name})? SQL cells that use its parameter will lose their input.`
  }
  const text = (draft ?? cell.content).replace(/\s+/g, ' ').trim()
  const preview = text.length > 80 ? `${text.slice(0, 80)}...` : text
  if (cell.type === 'sql') {
    const resultNote = cell.last_result_json ? ' Its stored result is removed too.' : ''
    return `Delete SQL cell ${label} "${preview}"?${resultNote}`
  }
  return `Delete Markdown cell ${label} "${preview}"?`
}
