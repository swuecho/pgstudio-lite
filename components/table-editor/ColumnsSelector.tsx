import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './ColumnsSelector.module.css'
import type { ColumnInfo } from './types'
import { isOutsideToolbarPopover, useToolbarPopoverPosition } from './useToolbarPopover'

type ColumnsSelectorProps = {
  columns: ColumnInfo[]
  visibleColumns: string[]
  onToggleColumn: (columnName: string) => void
  onShowAll: () => void
  onHideAll: () => void
}

export function ColumnsSelector({
  columns,
  visibleColumns,
  onToggleColumn,
  onShowAll,
  onHideAll,
}: ColumnsSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const dropdownStyle = useToolbarPopoverPosition(isOpen, anchorRef, 280)

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (isOutsideToolbarPopover(event.target as Node, [anchorRef.current, dropdownRef.current])) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const allSelected = columns.length > 0 && columns.every((col) => visibleColumns.includes(col.name))
  const someSelected = columns.some((col) => visibleColumns.includes(col.name))
  const selectedCount = visibleColumns.length

  const dropdown =
    isOpen && portalReady ? (
      <div ref={dropdownRef} className={styles.columnsSelectorDropdown} style={dropdownStyle}>
        <div className={styles.columnsSelectorHeader}>
          <span className={styles.columnsSelectorTitle}>Select Columns</span>
          <div className={styles.columnsSelectorActions}>
            <button className="btn small" onClick={onShowAll}>
              All
            </button>
            <button className="btn small" onClick={onHideAll}>
              None
            </button>
          </div>
        </div>
        <div className={styles.columnsSelectorList}>
          {columns.map((col) => (
            <label key={col.name} className={styles.columnsSelectorItem}>
              <input
                type="checkbox"
                checked={visibleColumns.includes(col.name)}
                onChange={() => onToggleColumn(col.name)}
              />
              <span className={styles.columnName}>{col.name}</span>
              <span className={styles.columnType}>{col.dataType}</span>
            </label>
          ))}
        </div>
      </div>
    ) : null

  return (
    <div className={styles.columnsSelector}>
      <button
        ref={anchorRef}
        className="btn small"
        onClick={() => setIsOpen((open) => !open)}
        title={`${selectedCount} of ${columns.length} columns selected`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        Columns{' '}
        {someSelected && !allSelected
          ? `(${selectedCount}/${columns.length})`
          : allSelected
            ? '(All)'
            : '(None)'}
      </button>
      {dropdown && portalReady ? createPortal(dropdown, document.body) : null}
    </div>
  )
}
