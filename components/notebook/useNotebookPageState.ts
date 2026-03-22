import { useEffect, useState } from 'react'
import { useSidebarResizer } from '../../hooks/useSidebarResizer'
import { useNotebookCellState } from './useNotebookCellState'
import { useNotebookCrudState } from './useNotebookCrudState'
import { useNotebookImport } from './useNotebookImport'

export type NotebookPageController = ReturnType<typeof useNotebookPageState>

export function useNotebookPageState() {
  const [status, setStatus] = useState('Notebook ready')
  const { sidebarWidth, handleWidthResizerMouseDown } = useSidebarResizer()

  const crud = useNotebookCrudState({ setStatus })
  const cells = useNotebookCellState({
    activeNotebookId: crud.activeNotebookId,
    detailQueryData: crud.detailQuery.data,
    setStatus,
  })
  const notebookImport = useNotebookImport({
    activeNotebookId: crud.activeNotebookId,
    setActiveNotebookId: crud.setActiveNotebookId,
    flushPendingSaves: cells.flushPendingSaves,
    setStatus,
  })

  async function setActiveNotebookId(nextNotebookId: string) {
    if (nextNotebookId === crud.activeNotebookId) return
    if (!(await cells.flushPendingSaves('switching notebooks'))) {
      return
    }
    crud.setActiveNotebookId(nextNotebookId)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      const typing = Boolean(target?.isContentEditable) || tag === 'input' || tag === 'textarea' || tag === 'select'

      if (event.key === 'Escape') {
        if (notebookImport.showImportModal) {
          event.preventDefault()
          notebookImport.setShowImportModal(false)
        } else if (notebookImport.showHelp) {
          event.preventDefault()
          notebookImport.setShowHelp(false)
        }
        return
      }

      if (!(event.metaKey || event.ctrlKey) || typing) return

      const key = event.key.toLowerCase()
      if (key === 'i') {
        event.preventDefault()
        notebookImport.setShowImportModal(true)
        return
      }
      if (key === 'e') {
        event.preventDefault()
        notebookImport.exportNotebookJson()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [notebookImport])

  return {
    ...crud,
    ...cells,
    handleWidthResizerMouseDown,
    notebookImport,
    setActiveNotebookId,
    sidebarWidth,
    status,
  }
}
