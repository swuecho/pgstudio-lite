import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { DATETIME_FILTER_TIMEZONE_HINT, getColumnKind } from '@/lib/table-column-kind'
import {
  defaultFilterModeForColumnKind,
  filterModeNeedsEndValue,
  filterModeNeedsValue,
  formatTableFilterSummary,
  getFilterModeOptionsForColumnKind,
  hasActiveTableFilter,
  isSlowFilterMode,
  type TableFilterMode,
} from '@/lib/table-filter'
import type { ColumnInfo } from './types'
import { ForeignKeyCombobox } from './ForeignKeyCombobox'
import { isOutsideToolbarPopover, useToolbarPopoverPosition } from './useToolbarPopover'
import styles from './FilterPopover.module.css'

type FilterPopoverProps = {
  columns: ColumnInfo[]
  connectionName: string
  filterColumn: string
  filterMode: TableFilterMode
  filterValue: string
  filterValueEnd: string
  totalRows: number
  filterValueInputRef: RefObject<HTMLInputElement | null>
  onChangeFilterColumn: (value: string) => void
  onChangeFilterMode: (value: TableFilterMode) => void
  onChangeFilterValue: (value: string) => void
  onChangeFilterValueEnd: (value: string) => void
  onClearFilters: () => void
}

function truncate(value: string, max = 42) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function FilterPopover({
  columns,
  connectionName,
  filterColumn,
  filterMode,
  filterValue,
  filterValueEnd,
  totalRows,
  filterValueInputRef,
  onChangeFilterColumn,
  onChangeFilterMode,
  onChangeFilterValue,
  onChangeFilterValueEnd,
  onClearFilters,
}: FilterPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const dropdownStyle = useToolbarPopoverPosition(isOpen, anchorRef)

  const filterColumnMeta = columns.find((column) => column.name === filterColumn)
  const filterColumnKind = getColumnKind(filterColumnMeta?.dataType ?? 'text')
  const filterModeOptions = getFilterModeOptionsForColumnKind(filterColumnKind)
  const filterValueRequired = filterModeNeedsValue(filterMode)
  const filterEndRequired = filterModeNeedsEndValue(filterMode)
  const hasFilters = hasActiveTableFilter(filterColumn, filterMode, filterValue, filterValueEnd)
  const showBooleanFilterValue = filterColumnKind === 'boolean' && filterValueRequired
  const showForeignKeyFilterValue =
    Boolean(filterColumnMeta?.foreignKey) &&
    filterValueRequired &&
    !showBooleanFilterValue &&
    !filterEndRequired
  const filterSummary = formatTableFilterSummary(filterColumn, filterMode, filterValue, filterValueEnd)
  const showSlowFilterWarning = isSlowFilterMode(filterMode) && totalRows > 1000

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault()
        setIsOpen(true)
        requestAnimationFrame(() => {
          filterValueInputRef.current?.focus()
          filterValueInputRef.current?.select()
        })
        return
      }

      if (event.key === 'Escape' && document.activeElement === filterValueInputRef.current) {
        if (filterValue) {
          onChangeFilterValue('')
        } else {
          filterValueInputRef.current?.blur()
          setIsOpen(false)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filterValue, filterValueInputRef, onChangeFilterValue])

  const dropdown =
    isOpen && portalReady ? (
      <div
        ref={dropdownRef}
        className={styles.filterDropdown}
        style={dropdownStyle}
        role="dialog"
        aria-label="Filter rows"
      >
        <div className={styles.filterHeader}>
          <span className={styles.filterTitle}>Filter</span>
          <button type="button" className="btn small" onClick={onClearFilters} disabled={!hasFilters}>
            Clear
          </button>
        </div>

        <div className={styles.filterBody}>
          {filterSummary ? <div className={styles.filterSummary}>{filterSummary}</div> : null}

          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Column</span>
            <select
              className={styles.filterControl}
              value={filterColumn}
              onChange={(event) => {
                const nextColumn = event.target.value
                onChangeFilterColumn(nextColumn)
                const nextKind = getColumnKind(
                  columns.find((column) => column.name === nextColumn)?.dataType ?? 'text'
                )
                onChangeFilterMode(defaultFilterModeForColumnKind(nextKind))
              }}
            >
              <option value="">Select column</option>
              {columns.map((column) => (
                <option key={`filter-${column.name}`} value={column.name}>
                  {column.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Operator</span>
            <select
              className={styles.filterControl}
              value={filterMode}
              onChange={(event) => onChangeFilterMode(event.target.value as TableFilterMode)}
              disabled={!filterColumn}
            >
              {filterModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Value</span>
            {showBooleanFilterValue ? (
              <select
                className={styles.filterControl}
                value={filterValue}
                onChange={(event) => onChangeFilterValue(event.target.value)}
                disabled={!filterColumn}
              >
                <option value="">Select value</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : showForeignKeyFilterValue && filterColumnMeta ? (
              <ForeignKeyCombobox
                column={filterColumnMeta}
                connectionName={connectionName}
                value={filterValue}
                onChange={onChangeFilterValue}
              />
            ) : (
              <input
                ref={filterValueInputRef}
                className={styles.filterControl}
                type={
                  filterColumnKind === 'numeric'
                    ? 'number'
                    : filterColumnKind === 'date'
                      ? 'date'
                      : filterColumnKind === 'datetime'
                        ? 'datetime-local'
                        : 'text'
                }
                step={filterColumnKind === 'numeric' ? 'any' : undefined}
                placeholder={filterValueRequired ? 'Filter value' : 'No value needed'}
                value={filterValue}
                onChange={(event) => onChangeFilterValue(event.target.value)}
                disabled={!filterColumn || !filterValueRequired}
              />
            )}
          </label>

          {filterEndRequired ? (
            <label className={styles.filterField}>
              <span className={styles.filterLabel}>To</span>
              <input
                className={styles.filterControl}
                type={
                  filterColumnKind === 'numeric'
                    ? 'number'
                    : filterColumnKind === 'date'
                      ? 'date'
                      : filterColumnKind === 'datetime'
                        ? 'datetime-local'
                        : 'text'
                }
                step={filterColumnKind === 'numeric' ? 'any' : undefined}
                placeholder="End value"
                value={filterValueEnd}
                onChange={(event) => onChangeFilterValueEnd(event.target.value)}
                disabled={!filterColumn}
              />
            </label>
          ) : null}

          {filterColumnKind === 'datetime' && filterValueRequired ? (
            <div className={styles.filterNotice}>{DATETIME_FILTER_TIMEZONE_HINT}</div>
          ) : null}

          {showSlowFilterWarning ? (
            <div className={styles.filterWarning}>
              This filter may be slow on large tables because it cannot use a standard index.
            </div>
          ) : null}
        </div>

        <div className={styles.filterHint}>Press / to open and focus filter value</div>
      </div>
    ) : null

  return (
    <div className={styles.filterPopover}>
      <button
        ref={anchorRef}
        type="button"
        className={`btn small ${hasFilters ? styles.filterButtonActive : ''}`}
        onClick={() => setIsOpen((open) => !open)}
        title={filterSummary ?? 'Filter rows'}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        {filterSummary ? `Filter: ${truncate(filterSummary)}` : 'Filter'}
      </button>
      {dropdown && portalReady ? createPortal(dropdown, document.body) : null}
    </div>
  )
}
