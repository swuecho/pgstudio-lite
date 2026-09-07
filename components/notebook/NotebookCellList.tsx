import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ErrorBoundary } from '../shared/ErrorBoundary'
import { NotebookCellRow } from './NotebookCellRow'
import type { NotebookPageController } from './useNotebookPageState'
import styles from './NotebookPage.module.css'

type NotebookCellListProps = {
  controller: NotebookPageController
}

/** Virtualized list of cells; each row is a `NotebookCellRow`. */
export function NotebookCellList({ controller }: NotebookCellListProps) {
  const { activeNotebookId, clearPendingCellAction, detailQuery, pendingCellAction, sortedCells } = controller

  const scrollRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: sortedCells.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const cell = sortedCells[index]
      if (!cell) return 200
      if (cell.collapsed) return 60
      if (cell.type === 'widget') return 150
      if (cell.type === 'markdown') return 120
      return 250
    },
    overscan: 5,
  })

  useEffect(() => {
    if (!pendingCellAction) return
    const targetIndex = sortedCells.findIndex((cell) => cell.id === pendingCellAction.cellId)
    if (targetIndex === -1) {
      clearPendingCellAction()
      return
    }
    virtualizer.scrollToIndex(targetIndex, { align: 'center' })
  }, [clearPendingCellAction, pendingCellAction, sortedCells, virtualizer])

  if (!activeNotebookId) {
    return <div className="empty-state">Create a notebook to begin.</div>
  }
  if (detailQuery.isLoading) {
    return <div className="empty-state">Loading notebook...</div>
  }
  if (sortedCells.length === 0) {
    return <div className="empty-state">No cells yet. Add SQL, Widget, or Markdown cells.</div>
  }

  return (
    <div ref={scrollRef} className={styles.cells}>
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const cell = sortedCells[virtualItem.index]
          if (!cell) return null
          return (
            <div
              key={cell.id}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <ErrorBoundary fallbackTitle={`Cell "${cell.id}" failed to render`}>
                <NotebookCellRow cell={cell} controller={controller} />
              </ErrorBoundary>
            </div>
          )
        })}
      </div>
    </div>
  )
}
