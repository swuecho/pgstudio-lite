import type {
  NotebookCell,
  NotebookInputCellMetadata,
  NotebookInputValues,
  NotebookWidgetMetadata,
} from '../components/notebook/types'
import { extractTemplateKeys } from './notebook-params'
import { getWidgetParamValues, isWidgetMetadata } from './notebook-widgets'

export type ReactiveNotebookState = {
  activeNotebookId: string
  runningAll: boolean
  runningCellId: string
  sortedCells: NotebookCell[]
  draftByCell: Record<string, string>
  inputDraftByCell: Record<string, NotebookInputCellMetadata>
  widgetDraftByCell: Record<string, NotebookWidgetMetadata>
}

export function getInputMetadata(cell: NotebookCell, inputDraftByCell: Record<string, NotebookInputCellMetadata>) {
  if (cell.type !== 'input') return null
  const metadata = inputDraftByCell[cell.id] || cell.metadata_json
  if (!metadata || !metadata.key) return null
  return metadata
}

export function getWidgetMetadata(cell: NotebookCell, widgetDraftByCell?: Record<string, NotebookWidgetMetadata>) {
  if (cell.type !== 'widget') return null
  const metadata = widgetDraftByCell?.[cell.id] || cell.metadata_json
  if (!metadata || !isWidgetMetadata(metadata)) return null
  return metadata as NotebookWidgetMetadata
}

export function buildInputValues(
  cells: NotebookCell[],
  inputDraftByCell: Record<string, NotebookInputCellMetadata>,
  widgetDraftByCell: Record<string, NotebookWidgetMetadata> = {}
) {
  const out: NotebookInputValues = {}
  for (const cell of cells) {
    const metadata = getInputMetadata(cell, inputDraftByCell)
    if (metadata) {
      out[metadata.key] = metadata.value
      continue
    }
    const widgetMetadata = getWidgetMetadata(cell, widgetDraftByCell)
    if (!widgetMetadata) continue
    Object.assign(out, getWidgetParamValues(widgetMetadata))
  }
  return out
}

export function getDependentSqlTargets(state: ReactiveNotebookState, inputCellId: string, inputKey: string) {
  const sourceCell = state.sortedCells.find((cell) => cell.id === inputCellId)
  if (!sourceCell) return []
  return state.sortedCells.filter((cell) => {
    if (cell.type !== 'sql') return false
    if (cell.position <= sourceCell.position) return false
    const query = state.draftByCell[cell.id] ?? cell.content
    return extractTemplateKeys(query).includes(inputKey)
  })
}

export async function runReactiveSqlCells({
  inputCellId,
  inputKey,
  getState,
  runCell,
}: {
  inputCellId: string
  inputKey: string
  getState: () => ReactiveNotebookState
  runCell: (args: { notebookId: string; cellId: string; query: string; inputValues: NotebookInputValues }) => Promise<void>
}) {
  const initialState = getState()
  if (!initialState.activeNotebookId || initialState.runningAll || initialState.runningCellId) {
    return [] as string[]
  }

  const targets = getDependentSqlTargets(initialState, inputCellId, inputKey)
  const executedCellIds: string[] = []

  for (const target of targets) {
    const state = getState()
    const notebookId = state.activeNotebookId
    if (!notebookId || state.runningAll) continue

    const query = (state.draftByCell[target.id] ?? target.content).trim()
    if (!query) continue

    await runCell({
      notebookId,
      cellId: target.id,
      query,
      inputValues: buildInputValues(state.sortedCells, state.inputDraftByCell, state.widgetDraftByCell),
    })
    executedCellIds.push(target.id)
  }

  return executedCellIds
}
