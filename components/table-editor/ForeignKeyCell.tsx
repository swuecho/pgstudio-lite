import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { ColumnInfo } from './types'
import { buildForeignKeyMatch, FOREIGN_KEY_JUMP_HINT, formatForeignKeyTarget } from './foreignKeyUtils'
import { isForeignKeyJumpClick, jumpToReferencedRow } from './foreignKeyJump'
import { ForeignKeyPopover } from './ForeignKeyPopover'
import { useForeignKeyLookup } from './useForeignKeyLookup'
import { useToolbarPopoverPosition } from './useToolbarPopover'
import styles from './TableEditorStyles.module.css'

const HOVER_DELAY_MS = 300

type ForeignKeyCellProps = {
  connectionName: string
  column: ColumnInfo
  row: Record<string, unknown>
  children: ReactNode
}

type PopoverState = {
  match: Record<string, unknown>
  status: 'loading' | 'found' | 'not_found' | 'error'
  columns: ColumnInfo[]
  row: Record<string, unknown> | null
  errorMessage?: string
}

export function ForeignKeyCell({ connectionName, column, row, children }: ForeignKeyCellProps) {
  const foreignKey = column.foreignKey
  const cellValue = row[column.name]
  const anchorRef = useRef<HTMLDivElement>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)
  const [isOpen, setIsOpen] = useState(false)
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const { fetchReferencedRow } = useForeignKeyLookup()
  const popoverStyle = useToolbarPopoverPosition(isOpen, anchorRef, 340)

  const canLookup =
    foreignKey &&
    cellValue !== null &&
    cellValue !== undefined &&
    buildForeignKeyMatch(row, foreignKey) !== null

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }, [])

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
  }, [])

  const closePopover = useCallback(() => {
    clearHoverTimer()
    clearLeaveTimer()
    requestIdRef.current += 1
    setIsOpen(false)
    setPopover(null)
  }, [clearHoverTimer, clearLeaveTimer])

  const scheduleClose = useCallback(() => {
    clearLeaveTimer()
    leaveTimerRef.current = setTimeout(() => {
      closePopover()
    }, 120)
  }, [clearLeaveTimer, closePopover])

  const loadReferencedRow = useCallback(
    async (match: Record<string, unknown>) => {
      if (!foreignKey) return
      const requestId = ++requestIdRef.current
      setPopover({
        match,
        status: 'loading',
        columns: [],
        row: null,
      })
      setIsOpen(true)
      try {
        const result = await fetchReferencedRow({
          connectionName,
          schema: foreignKey.referencedSchema,
          table: foreignKey.referencedTable,
          match,
        })
        if (requestId !== requestIdRef.current) return
        setPopover({
          match,
          status: result.row ? 'found' : 'not_found',
          columns: result.columns,
          row: result.row,
        })
      } catch (error) {
        if (requestId !== requestIdRef.current) return
        setPopover({
          match,
          status: 'error',
          columns: [],
          row: null,
          errorMessage: error instanceof Error ? error.message : 'Failed to load referenced row',
        })
      }
    },
    [connectionName, fetchReferencedRow, foreignKey]
  )

  const scheduleOpen = useCallback(() => {
    if (!canLookup || !foreignKey) return
    clearHoverTimer()
    hoverTimerRef.current = setTimeout(() => {
      const match = buildForeignKeyMatch(row, foreignKey)
      if (!match) return
      void loadReferencedRow(match)
    }, HOVER_DELAY_MS)
  }, [canLookup, clearHoverTimer, foreignKey, loadReferencedRow, row])

  useEffect(() => {
    if (!isOpen) return
    function handleScroll() {
      closePopover()
    }
    window.addEventListener('scroll', handleScroll, true)
    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [closePopover, isOpen])

  useEffect(
    () => () => {
      clearHoverTimer()
      clearLeaveTimer()
    },
    [clearHoverTimer, clearLeaveTimer]
  )

  if (!foreignKey || !canLookup) {
    return <>{children}</>
  }

  const match = buildForeignKeyMatch(row, foreignKey)
  if (!match) {
    return <>{children}</>
  }

  // Arrow functions (not hoisted declarations) so the `match`/`foreignKey` narrowing above applies.
  const jump = () => {
    closePopover()
    jumpToReferencedRow({ connectionName, foreignKey, match })
  }

  // Capture phase so a ⌘/Ctrl+click never reaches the click-to-copy cell underneath.
  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!isForeignKeyJumpClick(event)) return
    event.preventDefault()
    event.stopPropagation()
    jump()
  }

  return (
    <div
      ref={anchorRef}
      className={styles.fkCell}
      title={FOREIGN_KEY_JUMP_HINT}
      onClickCapture={handleClickCapture}
      onMouseEnter={() => {
        clearLeaveTimer()
        scheduleOpen()
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className={styles.fkCellIcon}
        title={`Open referenced row in ${formatForeignKeyTarget(foreignKey)}`}
        aria-label={`Open referenced row in ${formatForeignKeyTarget(foreignKey)}`}
        tabIndex={-1}
        onClick={(event) => {
          event.stopPropagation()
          jump()
        }}
      >
        ↗
      </button>
      {children}
      {isOpen && popover ? (
        <ForeignKeyPopover
          anchorStyle={popoverStyle}
          connectionName={connectionName}
          foreignKey={foreignKey}
          cellValue={cellValue}
          match={match}
          status={popover.status}
          columns={popover.columns}
          row={popover.row}
          errorMessage={popover.errorMessage}
          onMouseEnter={() => {
            clearHoverTimer()
            clearLeaveTimer()
          }}
          onMouseLeave={closePopover}
        />
      ) : null}
    </div>
  )
}
