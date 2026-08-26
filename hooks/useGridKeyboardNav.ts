import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

type GridDimensions = {
  rowCount: number
  colCount: number
}

const CELL_ATTRIBUTE = 'data-grid-cell'

/**
 * Roving-tabindex navigation for read-only value grids.
 *
 * These grids render one focusable copy target per cell, so a 50x13 result put
 * 650 elements in the tab sequence — reaching the pager below the table meant
 * hundreds of Tab presses. Exactly one cell is tabbable at a time now; arrows,
 * Home/End, and PageUp/PageDown move between them.
 *
 * Editable grids are deliberately left alone: tabbing between <input> cells is
 * the behaviour people expect there.
 */
export function useGridKeyboardNav({ rowCount, colCount }: GridDimensions) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [focusedCell, setFocusedCell] = useState({ row: 0, col: 0 })

  // Keep the roving cell inside the grid when paging, filtering, or resizing.
  useEffect(() => {
    setFocusedCell((current) => {
      const row = Math.min(current.row, Math.max(rowCount - 1, 0))
      const col = Math.min(current.col, Math.max(colCount - 1, 0))
      if (row === current.row && col === current.col) return current
      return { row, col }
    })
  }, [rowCount, colCount])

  const focusCell = useCallback((row: number, col: number) => {
    setFocusedCell({ row, col })
    const container = containerRef.current
    if (!container) return
    const next = container.querySelector<HTMLElement>(`[${CELL_ATTRIBUTE}="${row}-${col}"]`)
    next?.focus()
  }, [])

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (rowCount === 0 || colCount === 0) return
      // Only react when focus is inside a grid cell, not a toolbar or pager.
      if (!(event.target instanceof HTMLElement) || !event.target.hasAttribute(CELL_ATTRIBUTE)) return

      const { row, col } = focusedCell
      const lastRow = rowCount - 1
      const lastCol = colCount - 1
      let nextRow = row
      let nextCol = col

      switch (event.key) {
        case 'ArrowUp':
          nextRow = Math.max(row - 1, 0)
          break
        case 'ArrowDown':
          nextRow = Math.min(row + 1, lastRow)
          break
        case 'ArrowLeft':
          nextCol = Math.max(col - 1, 0)
          break
        case 'ArrowRight':
          nextCol = Math.min(col + 1, lastCol)
          break
        case 'Home':
          if (event.ctrlKey || event.metaKey) nextRow = 0
          nextCol = 0
          break
        case 'End':
          if (event.ctrlKey || event.metaKey) nextRow = lastRow
          nextCol = lastCol
          break
        case 'PageUp':
          nextRow = 0
          break
        case 'PageDown':
          nextRow = lastRow
          break
        default:
          return
      }

      if (nextRow === row && nextCol === col) {
        event.preventDefault()
        return
      }

      event.preventDefault()
      focusCell(nextRow, nextCol)
    },
    [colCount, focusCell, focusedCell, rowCount]
  )

  /** Spread onto each cell's focusable element. */
  const cellProps = useCallback(
    (row: number, col: number) => ({
      'data-grid-cell': `${row}-${col}`,
      tabIndex: focusedCell.row === row && focusedCell.col === col ? 0 : -1,
      onCellFocus: () => setFocusedCell({ row, col }),
    }),
    [focusedCell]
  )

  return { containerRef, cellProps, onKeyDown }
}
