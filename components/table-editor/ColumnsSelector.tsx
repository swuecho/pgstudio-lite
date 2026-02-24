import { useState, useRef, useEffect } from 'react'
import type { ColumnInfo } from './types'

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
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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

  return (
    <div className="columns-selector" ref={containerRef}>
      <button
        className="btn small"
        onClick={() => setIsOpen(!isOpen)}
        title={`${selectedCount} of ${columns.length} columns selected`}
      >
        Columns {someSelected && !allSelected ? `(${selectedCount}/${columns.length})` : allSelected ? '(All)' : '(None)'}
      </button>
      {isOpen && (
        <div className="columns-selector-dropdown">
          <div className="columns-selector-header">
            <span className="columns-selector-title">Select Columns</span>
            <div className="columns-selector-actions">
              <button className="btn small" onClick={onShowAll}>
                All
              </button>
              <button className="btn small" onClick={onHideAll}>
                None
              </button>
            </div>
          </div>
          <div className="columns-selector-list">
            {columns.map((col) => (
              <label key={col.name} className="columns-selector-item">
                <input
                  type="checkbox"
                  checked={visibleColumns.includes(col.name)}
                  onChange={() => onToggleColumn(col.name)}
                />
                <span className="column-name">{col.name}</span>
                <span className="column-type">{col.dataType}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
