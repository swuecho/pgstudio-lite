import { useTableEditorData } from './useTableEditorData'
import { useTableEditorLocalState } from './useTableEditorLocalState'

export function useTableEditorState() {
  const state = useTableEditorLocalState()
  const actions = useTableEditorData(state)

  return {
    ...state,
    ...actions,
  }
}
