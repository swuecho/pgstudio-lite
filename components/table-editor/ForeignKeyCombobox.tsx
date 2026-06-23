import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { getForeignKeyOptions, type ForeignKeyOption } from '../../features/table/table.service'
import type { ColumnInfo } from './types'
import styles from './TableEditorStyles.module.css'

const SEARCH_DEBOUNCE_MS = 200
const OPTION_LIMIT = 50
const MIN_DROPDOWN_WIDTH = 320

type ForeignKeyComboboxProps = {
  column: ColumnInfo
  connectionName: string
  value: string
  onChange: (value: string) => void
}

/**
 * Combobox for foreign-key columns: searches the referenced table server-side
 * and lets the user pick an existing value from a dropdown. Unlike a native
 * <datalist>, the human-readable label stays visible after selection while the
 * committed value remains the raw key sent to the database.
 */
export function ForeignKeyCombobox({ column, connectionName, value, onChange }: ForeignKeyComboboxProps) {
  const foreignKey = column.foreignKey!
  const anchorRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const requestIdRef = useRef(0)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)
  const [options, setOptions] = useState<ForeignKeyOption[]>([])
  const [loading, setLoading] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({})

  const displayValue = editing ? query : (selectedLabel ?? value)

  // Anchor the dropdown under the input, at least as wide as the field but never
  // narrower than MIN_DROPDOWN_WIDTH so labels and ids stay readable in narrow
  // grid cells. Keep it within the viewport.
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    const update = () => {
      const rect = anchorRef.current!.getBoundingClientRect()
      const width = Math.min(Math.max(rect.width, MIN_DROPDOWN_WIDTH), window.innerWidth - 16)
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left,
        width,
        zIndex: 1000,
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

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
      })
        .then((result) => {
          if (requestId !== requestIdRef.current) return
          setOptions(result.options)
          setTruncated(result.truncated)
          setActiveIndex(result.options.length > 0 ? 0 : -1)
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

  const closeDropdown = useCallback(() => {
    setOpen(false)
    setEditing(false)
  }, [])

  const commitOption = useCallback(
    (option: ForeignKeyOption) => {
      onChange(String(option.value))
      setSelectedLabel(option.label)
      setOpen(false)
      setEditing(false)
    },
    [onChange]
  )

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (anchorRef.current?.contains(target)) return
      if (document.getElementById(listboxId)?.contains(target)) return
      closeDropdown()
    }
    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [open, closeDropdown, listboxId])

  function handleInputChange(text: string) {
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
      }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeDropdown()
    }
  }

  return (
    <div className={styles.fkCombobox} ref={anchorRef}>
      <input
        className={styles.cellInput}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        value={displayValue}
        placeholder={`→ ${foreignKey.referencedTable}.${foreignKey.referencedColumn}`}
        onFocus={openDropdown}
        onChange={(event) => handleInputChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {value && !editing && selectedLabel && selectedLabel !== value ? (
        <span className={styles.insertRowHint}>{`= ${value}`}</span>
      ) : null}
      {open
        ? createPortal(
            <div id={listboxId} role="listbox" className={styles.fkComboboxDropdown} style={dropdownStyle}>
              {loading ? (
                <div className={styles.fkComboboxEmpty}>Loading…</div>
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
                    }`}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      commitOption(option)
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <span className={styles.fkComboboxOptionLabel}>{option.label}</span>
                    {option.label !== String(option.value) ? (
                      <span className={styles.fkComboboxOptionValue}>{String(option.value)}</span>
                    ) : null}
                  </button>
                ))
              )}
              {truncated ? (
                <div className={styles.fkComboboxFooter}>Showing first {options.length} — type to search</div>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
