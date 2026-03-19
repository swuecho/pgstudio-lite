import { useEffect, useState } from 'react'
import { useSidebarResizer } from '../../hooks/useSidebarResizer'
import { useNotebookCellState } from './useNotebookCellState'
import { useNotebookCrudState } from './useNotebookCrudState'

export type NotebookPageController = ReturnType<typeof useNotebookPageState>

export function useNotebookPageState() {
  const [runningAll, setRunningAll] = useState(false)
  const [status, setStatus] = useState('Notebook ready')
  const { sidebarWidth, handleWidthResizerMouseDown } = useSidebarResizer()

  const crud = useNotebookCrudState({ setStatus })
  const cells = useNotebookCellState({
    activeNotebookId: crud.activeNotebookId,
    detailQueryData: crud.detailQuery.data,
    setStatus,
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      const typing = Boolean(target?.isContentEditable) || tag === 'input' || tag === 'textarea' || tag === 'select'

      if (event.key === 'Escape') {
        if (crud.notebookImport.showImportModal) {
          event.preventDefault()
          crud.notebookImport.setShowImportModal(false)
        } else if (crud.notebookImport.showHelp) {
          event.preventDefault()
          crud.notebookImport.setShowHelp(false)
        }
        return
      }

      if (!(event.metaKey || event.ctrlKey) || typing) return

      const key = event.key.toLowerCase()
      if (key === 'i') {
        event.preventDefault()
        crud.notebookImport.setShowImportModal(true)
        return
      }
      if (key === 'e') {
        event.preventDefault()
        crud.notebookImport.exportNotebookJson()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [crud.notebookImport])

  return {
    ...crud,
    ...cells,
    handleWidthResizerMouseDown,
    sidebarWidth,
    status,
  }
}
