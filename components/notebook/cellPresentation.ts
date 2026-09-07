import type { NotebookCellUiState } from './types'

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
