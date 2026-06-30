import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { getForeignKeyOptions, type ForeignKeyOption } from '../../features/table/table.service'
import type { ColumnInfo } from './types'
import styles from './TableEditorStyles.module.css'

const SEARCH_DEBOUNCE_MS = 200
const OPTION_LIMIT = 50
const MIN_DROPDOWN_WIDTH = 320
const DROPDOWN_GAP = 4
const DROPDOWN_MAX_HEIGHT = 280
const VIEWPORT_MARGIN = 8

type ForeignKeyComboboxProps = {
  column: ColumnInfo
  connectionName: string
  value: string
  onChange: (value: string) => void
  onCommit?: (value: string, label?: string) => void
  onCancel?: () => void
  onReady?: () => void
  autoFocus?: boolean
  selectedValue?: string
  variant?: 'field' | 'cell'
  popoverAnchorRef?: RefObject<HTMLElement | null>
}

/**
 * Combobox for foreign-key columns: searches the referenced table server-side
 * and lets the user pick an existing value from a dropdown. Unlike a native
 * <datalist>, the human-readable label stays visible after selection while the
 * committed value remains the raw key sent to the database.
 */
export function ForeignKeyCombobox({
  column,
  connectionName,
  value,
  onChange,
  onCommit,
  onCancel,
  onReady,
  autoFocus = false,
  selectedValue,
  variant = 'field',
  popoverAnchorRef,
}: ForeignKeyComboboxProps) {
  const foreignKey = column.foreignKey!
  const anchorRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()
  const requestIdRef = useRef(0)

  const [open, setOpen] = useState(autoFocus)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(autoFocus)
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)
  const [options, setOptions] = useState<ForeignKeyOption[]>([])
  const [loading, setLoading] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({})

  const displayValue = editing ? query : (selectedLabel ?? value)
  const isCellVariant = variant === 'cell'
  const usePopover = isCellVariant && Boolean(popoverAnchorRef)
  const pinnedValue = selectedValue ?? value

  // Anchor the dropdown under the input, at least as wide as the field but never
  // narrower than MIN_DROPDOWN_WIDTH so labels and ids stay readable in narrow
  // grid cells. Keep it within the viewport.
  useLayoutEffect(() => {
    const anchorElement = popoverAnchorRef?.current ?? anchorRef.current
    if (!open || !anchorElement) return
    const update = () => {
      const rect = anchorElement.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const width = Math.min(Math.max(rect.width, isCellVariant ? 420 : MIN_DROPDOWN_WIDTH), window.innerWidth - 16)
      const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN))
      const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_MARGIN
      const spaceAbove = rect.top - VIEWPORT_MARGIN
      const shouldOpenAbove = spaceBelow < 180 && spaceAbove > spaceBelow
      const maxHeight = Math.max(120, Math.min(DROPDOWN_MAX_HEIGHT, shouldOpenAbove ? spaceAbove : spaceBelow))
      const top = shouldOpenAbove
        ? Math.max(VIEWPORT_MARGIN, rect.top - maxHeight - DROPDOWN_GAP)
        : Math.min(rect.bottom + DROPDOWN_GAP, viewportHeight - maxHeight - VIEWPORT_MARGIN)
      setDropdownStyle({
        position: 'fixed',
        top,
        left,
        width,
        maxHeight,
        zIndex: 10000,
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [isCellVariant, open, popoverAnchorRef])

  useEffect(() => {
    if (!open) return
    const requestId = ++requestIdRef.current
    setLoading(true)
    const handle = setTimeout(() => {
      getForeignKeyOptions({
        connectionName,
        schema: foreignKey.referencedSchema,
        table: foreignKey.referencedTable,
        column: foreignKey.referencedColumn,
        search: query,
        limit: OPTION_LIMIT,
        selectedValue: pinnedValue,
      })
        .then((result) => {
          if (requestId !== requestIdRef.current) return
          setOptions(result.options)
          setTruncated(result.truncated)
          const selectedIndex = result.options.findIndex((option) => option.selected)
          setActiveIndex(selectedIndex >= 0 ? selectedIndex : result.options.length > 0 ? 0 : -1)
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return
          setOptions([])
          setTruncated(false)
          setActiveIndex(-1)
        })
        .finally(() => {
          if (requestId !== requestIdRef.current) return
          setLoading(false)
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [
    open,
    query,
    pinnedValue,
    connectionName,
    foreignKey.referencedSchema,
    foreignKey.referencedTable,
    foreignKey.referencedColumn,
  ])

  const openDropdown = useCallback(() => {
    setEditing(true)
    setQuery('')
    setOpen(true)
  }, [])

  useEffect(() => {
    if (!autoFocus) return
    inputRef.current?.focus()
    onReady?.()
  }, [autoFocus, onReady])

  const closeDropdown = useCallback(() => {
    setOpen(false)
    setEditing(false)
  }, [])

  const commitOption = useCallback(
    (option: ForeignKeyOption) => {
      const nextValue = String(option.value)
      onChange(nextValue)
      setSelectedLabel(option.label)
      setOpen(false)
      setEditing(false)
      onCommit?.(nextValue, option.label)
    },
    [onChange, onCommit]
  )

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      const anchorElement = popoverAnchorRef?.current ?? anchorRef.current
      if (anchorElement?.contains(target)) return
      if (document.getElementById(listboxId)?.contains(target)) return
      closeDropdown()
      onCancel?.()
    }
    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [open, closeDropdown, listboxId, onCancel, popoverAnchorRef])

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const text = event.target.value
    setEditing(true)
    setQuery(text)
    setSelectedLabel(null)
    setOpen(true)
    // Allow typing a raw key directly; the partial search text becomes the value
    // until an option is chosen. Invalid keys surface as an insert-time error.
    onChange(text)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        openDropdown()
      }
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(options.length - 1, index + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(0, index - 1))
    } else if (event.key === 'Enter') {
      const option = options[activeIndex]
      if (option) {
        event.preventDefault()
        commitOption(option)
      } else if (onCommit) {
        event.preventDefault()
        const nextValue = query.trim()
        setOpen(false)
        setEditing(false)
        onCommit(nextValue)
      }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeDropdown()
      onCancel?.()
    }
  }

  const input = (
      <input
        ref={inputRef}
        className={styles.cellInput}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        value={displayValue}
        placeholder={`→ ${foreignKey.referencedTable}.${foreignKey.referencedColumn}`}
        onFocus={openDropdown}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
      />
  )

  const optionList = (
    <>
      {loading ? (
        <div className={styles.fkComboboxEmpty}>Loading...</div>
      ) : options.length === 0 ? (
        <div className={styles.fkComboboxEmpty}>No matching rows</div>
      ) : (
        options.map((option, index) => (
          <button
            type="button"
            key={String(option.value)}
            role="option"
            aria-selected={index === activeIndex}
            className={`${styles.fkComboboxOption} ${
              index === activeIndex ? styles.fkComboboxOptionActive : ''
            } ${option.selected ? styles.fkComboboxOptionSelected : ''}`}
            onMouseDown={(event) => {
              event.preventDefault()
              commitOption(option)
            }}
            onMouseEnter={() => setActiveIndex(index)}
          >
            <span className={styles.fkComboboxOptionText}>
              <span className={styles.fkComboboxOptionLabel}>{option.label}</span>
              <span className={styles.fkComboboxOptionTarget}>
                {option.selected ? 'Current value' : `${foreignKey.referencedTable}.${foreignKey.referencedColumn}`}
              </span>
            </span>
            {option.label !== String(option.value) ? (
              <span className={styles.fkComboboxOptionValue}>{String(option.value)}</span>
            ) : null}
          </button>
        ))
      )}
      {truncated ? (
        <div className={styles.fkComboboxFooter}>Showing first {options.length} - type to search</div>
      ) : null}
    </>
  )

  if (usePopover) {
    return open
      ? createPortal(
          <div className={styles.fkComboboxPopover} style={dropdownStyle}>
            <div className={styles.fkComboboxPopoverHeader}>{input}</div>
            <div id={listboxId} role="listbox" className={styles.fkComboboxPopoverList}>
              {optionList}
            </div>
          </div>,
          document.body
        )
      : null
  }

  return (
    <div className={`${styles.fkCombobox} ${isCellVariant ? styles.fkComboboxCell : ''}`} ref={anchorRef}>
      {input}
      {value && !editing && selectedLabel && selectedLabel !== value ? (
        <span className={styles.insertRowHint}>{`= ${value}`}</span>
      ) : null}
      {open
        ? createPortal(
            <div id={listboxId} role="listbox" className={styles.fkComboboxDropdown} style={dropdownStyle}>
              {optionList}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
