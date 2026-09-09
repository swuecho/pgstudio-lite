import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { getForeignKeyOptions, type ForeignKeyOption } from '@/features/table/table.service'
import { FK_DISPLAY_CONFIG_CHANGED_EVENT, ForeignKeyCombobox } from './ForeignKeyCombobox'
import { isForeignKeyJumpClick, jumpToReferencedRow } from './foreignKeyJump'
import { buildForeignKeyMatch, FOREIGN_KEY_JUMP_HINT } from './foreignKeyUtils'
import type { ColumnInfo, RowData } from './types'
import type { CommitRowChange } from './useGridRowChanges'
import styles from './TableEditorStyles.module.css'

type CellForeignKeyEditorProps = {
  connectionName: string
  column: ColumnInfo
  row: RowData
  onCommit: CommitRowChange
}

const FK_CELL_EDIT_EVENT = 'pgstudio:fk-cell-edit'
const fkLabelCache = new Map<string, Promise<ForeignKeyOption | null>>()
const FK_CACHE_KEY_SEPARATOR = '\u001f'

function getForeignKeyLabelCacheKey(connectionName: string, column: ColumnInfo, value: string) {
  const foreignKey = column.foreignKey!
  return [
    connectionName,
    foreignKey.referencedSchema,
    foreignKey.referencedTable,
    foreignKey.referencedColumn,
    value,
  ].join(FK_CACHE_KEY_SEPARATOR)
}

function clearForeignKeyLabelCache(args: { connectionName: string; schema: string; table: string }) {
  const prefix =
    [args.connectionName, args.schema, args.table].join(FK_CACHE_KEY_SEPARATOR) + FK_CACHE_KEY_SEPARATOR
  for (const key of fkLabelCache.keys()) {
    if (key.startsWith(prefix)) fkLabelCache.delete(key)
  }
}

function loadSelectedForeignKeyOption(connectionName: string, column: ColumnInfo, value: string) {
  const cacheKey = getForeignKeyLabelCacheKey(connectionName, column, value)
  const cached = fkLabelCache.get(cacheKey)
  if (cached) return cached

  const foreignKey = column.foreignKey!
  const request = getForeignKeyOptions({
    connectionName,
    schema: foreignKey.referencedSchema,
    table: foreignKey.referencedTable,
    column: foreignKey.referencedColumn,
    selectedValue: value,
    limit: 1,
  })
    .then((result) => {
      return (
        result.options.find((option) => option.selected) ??
        result.options.find((option) => String(option.value) === value) ??
        null
      )
    })
    .catch(() => null)

  fkLabelCache.set(cacheKey, request)
  return request
}

/**
 * Compact foreign-key cell editor. The grid stays readable until the user opens
 * the picker; selecting an option commits the raw key explicitly.
 */
export function CellForeignKeyEditor({ connectionName, column, row, onCommit }: CellForeignKeyEditorProps) {
  const initial = row[column.name]
  const initialText = initial === null || initial === undefined ? '' : String(initial)
  const [draftValue, setDraftValue] = useState(initialText)
  const [editing, setEditing] = useState(false)
  const [labelRefreshVersion, setLabelRefreshVersion] = useState(0)
  const [resolvedSelection, setResolvedSelection] = useState<{ value: string; label: string } | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const editorId = useMemo(() => {
    try {
      return `${column.name}:${JSON.stringify(row._rowKey)}`
    } catch {
      return `${column.name}:${String(row._rowKey)}`
    }
  }, [column.name, row._rowKey])

  useEffect(() => {
    setDraftValue(initialText)
    setResolvedSelection((current) => (current && current.value === initialText ? current : null))
  }, [initialText])

  useEffect(() => {
    if (!initialText || !column.foreignKey || !connectionName) return

    let cancelled = false
    void loadSelectedForeignKeyOption(connectionName, column, initialText).then((option) => {
      if (cancelled || !option) return
      setResolvedSelection({ value: String(option.value), label: option.label })
    })

    return () => {
      cancelled = true
    }
  }, [column, connectionName, initialText, labelRefreshVersion])

  useEffect(() => {
    function handleForeignKeyDisplayConfigChanged(event: Event) {
      if (!(event instanceof CustomEvent) || !column.foreignKey) return
      const detail = event.detail as { connectionName?: string; schema?: string; table?: string } | null
      const foreignKey = column.foreignKey
      if (
        detail?.connectionName !== connectionName ||
        detail.schema !== foreignKey.referencedSchema ||
        detail.table !== foreignKey.referencedTable
      ) {
        return
      }

      clearForeignKeyLabelCache({
        connectionName,
        schema: foreignKey.referencedSchema,
        table: foreignKey.referencedTable,
      })
      setResolvedSelection(null)
      setLabelRefreshVersion((version) => version + 1)
    }

    window.addEventListener(FK_DISPLAY_CONFIG_CHANGED_EVENT, handleForeignKeyDisplayConfigChanged)
    return () =>
      window.removeEventListener(FK_DISPLAY_CONFIG_CHANGED_EVENT, handleForeignKeyDisplayConfigChanged)
  }, [column.foreignKey, connectionName])

  useEffect(() => {
    function handleForeignKeyCellEdit(event: Event) {
      const activeEditorId = event instanceof CustomEvent ? event.detail : null
      if (activeEditorId === editorId) return
      setEditing(false)
      setDraftValue(initialText)
    }

    window.addEventListener(FK_CELL_EDIT_EVENT, handleForeignKeyCellEdit)
    return () => window.removeEventListener(FK_CELL_EDIT_EVENT, handleForeignKeyCellEdit)
  }, [editorId, initialText])

  function commitValue(nextText: string, label?: string) {
    const next = nextText === '' ? null : nextText
    const result = onCommit(row, column.name, next, column.dataType, () => {
      setDraftValue(initialText)
      setResolvedSelection(null)
    })
    if (result === 'unchanged') {
      setDraftValue(initialText)
      setResolvedSelection(null)
      setEditing(false)
      return
    }
    setDraftValue(nextText)
    setResolvedSelection(label ? { value: nextText, label } : null)
    setEditing(false)
  }

  function openEditor() {
    window.dispatchEvent(new CustomEvent(FK_CELL_EDIT_EVENT, { detail: editorId }))
    setDraftValue(displayedRawValue)
    setEditing(true)
  }

  function cancelEditing() {
    setDraftValue(initialText)
    setEditing(false)
  }

  const displayedRawValue = resolvedSelection?.value ?? initialText
  const displayValue = resolvedSelection?.label || displayedRawValue
  const jumpMatch = column.foreignKey ? buildForeignKeyMatch(row, column.foreignKey) : null

  function handleButtonClick(event: MouseEvent<HTMLButtonElement>) {
    if (jumpMatch && column.foreignKey && isForeignKeyJumpClick(event)) {
      event.preventDefault()
      jumpToReferencedRow({ connectionName, foreignKey: column.foreignKey, match: jumpMatch })
      return
    }
    openEditor()
  }

  return (
    <div className={styles.tableCellEditor} ref={anchorRef}>
      <button
        type="button"
        className={styles.fkCellEditorButton}
        title={jumpMatch ? `Edit ${column.name} · ${FOREIGN_KEY_JUMP_HINT}` : `Edit ${column.name}`}
        aria-expanded={editing}
        onClick={handleButtonClick}
      >
        <span className={styles.fkCellEditorIcon} aria-hidden>
          ↗
        </span>
        <span className={styles.fkCellEditorText}>{displayValue || 'NULL'}</span>
        {resolvedSelection && resolvedSelection.label !== resolvedSelection.value ? (
          <span className={styles.fkCellEditorValue}>{resolvedSelection.value}</span>
        ) : null}
      </button>
      {editing ? (
        <ForeignKeyCombobox
          column={column}
          connectionName={connectionName}
          value={draftValue}
          onChange={setDraftValue}
          onCommit={commitValue}
          onCancel={cancelEditing}
          autoFocus
          selectedValue={displayedRawValue}
          variant="cell"
          popoverAnchorRef={anchorRef}
        />
      ) : null}
    </div>
  )
}
