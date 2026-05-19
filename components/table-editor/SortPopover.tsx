import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ColumnInfo } from './types'
import { isOutsideToolbarPopover, useToolbarPopoverPosition } from './useToolbarPopover'
import styles from './SortPopover.module.css'

type SortPopoverProps = {
  columns: ColumnInfo[]
  sortBy: string
  sortOrder: 'asc' | 'desc'
  onChangeSortBy: (value: string) => void
  onChangeSortOrder: (value: 'asc' | 'desc') => void
}

function truncate(value: string, max = 36) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export function SortPopover({
  columns,
  sortBy,
  sortOrder,
  onChangeSortBy,
  onChangeSortOrder,
}: SortPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const dropdownStyle = useToolbarPopoverPosition(isOpen, anchorRef, 280)

  const summary = sortBy ? `${sortBy} ${sortOrder.toUpperCase()}` : null

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

  const dropdown =
    isOpen && portalReady ? (
      <div ref={dropdownRef} className={styles.sortDropdown} style={dropdownStyle} role="dialog" aria-label="Sort rows">
        <div className={styles.sortHeader}>
          <span className={styles.sortTitle}>Sort</span>
        </div>
        <div className={styles.sortBody}>
          <label className={styles.sortField}>
            <span className={styles.sortLabel}>Column</span>
            <select className={styles.sortControl} value={sortBy} onChange={(e) => onChangeSortBy(e.target.value)}>
              <option value="">Default order</option>
              {columns.map((column) => (
                <option key={`sort-${column.name}`} value={column.name}>
                  {column.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.sortField}>
            <span className={styles.sortLabel}>Direction</span>
            <select
              className={styles.sortControl}
              value={sortOrder}
              onChange={(e) => onChangeSortOrder(e.target.value as 'asc' | 'desc')}
              disabled={!sortBy}
            >
              <option value="asc">ASC</option>
              <option value="desc">DESC</option>
            </select>
          </label>
        </div>
      </div>
    ) : null

  return (
    <div className={styles.sortPopover}>
      <button
        ref={anchorRef}
        type="button"
        className={`btn small ${summary ? styles.sortButtonActive : ''}`}
        onClick={() => setIsOpen((open) => !open)}
        title={summary ? `Sort by ${summary}` : 'Sort rows'}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        {summary ? `Sort: ${truncate(summary)}` : 'Sort'}
      </button>
      {dropdown && portalReady ? createPortal(dropdown, document.body) : null}
    </div>
  )
}
