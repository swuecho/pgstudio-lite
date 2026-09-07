import { isBooleanColumn, isDateColumn, isDateTimeColumn, isJsonColumn } from '@/lib/table-column-kind'
import { CellForeignKeyEditor } from './CellForeignKeyEditor'
import {
  formatJsonbPreview,
  getEditorKind,
  toDateInputValue,
  toDateTimeInputValue,
  truncate,
} from './gridCellValues'
import type { ColumnInfo, RowData } from './types'
import type { CommitRowChange } from './useGridRowChanges'
import styles from './TableEditorStyles.module.css'

type GridCellEditorProps = {
  connectionName: string
  column: ColumnInfo
  row: RowData
  onCommit: CommitRowChange
  onOpenCellView: (row: RowData, column: ColumnInfo) => void
}

/**
 * The editable rendering of one cell, chosen by column type: foreign key
 * combobox, boolean toggle, date / datetime pickers, a JSON preview that opens
 * the side panel, or a plain text input. Inputs are uncontrolled and commit on
 * blur; when the change is a no-op or gets cancelled they reset themselves.
 */
export function GridCellEditor({
  connectionName,
  column,
  row,
  onCommit,
  onOpenCellView,
}: GridCellEditorProps) {
  const value = row[column.name]

  if (column.foreignKey) {
    return (
      <CellForeignKeyEditor connectionName={connectionName} column={column} row={row} onCommit={onCommit} />
    )
  }

  if (isBooleanColumn(column.dataType)) {
    return (
      <div className={styles.tableCellEditor}>
        <button
          className={`${styles.tableBoolToggle} ${value === true ? styles.tableBoolToggleOn : ''}`}
          onClick={() => {
            onCommit(row, column.name, value !== true, column.dataType)
          }}
          title={`Toggle ${column.name}`}
        >
          {value === true ? 'TRUE' : 'FALSE'}
        </button>
      </div>
    )
  }

  if (isDateColumn(column.dataType)) {
    return (
      <div className={styles.tableCellEditor}>
        <input
          className={`${styles.cellInput} ${styles.tableTypedInput}`}
          type="date"
          defaultValue={toDateInputValue(value)}
          onBlur={(e) => {
            const target = e.currentTarget
            const nextValue = target.value || null
            const result = onCommit(row, column.name, nextValue, column.dataType, () => {
              target.value = toDateInputValue(value)
            })
            if (result === 'unchanged') target.value = toDateInputValue(value)
          }}
        />
      </div>
    )
  }

  if (isDateTimeColumn(column.dataType)) {
    return (
      <div className={styles.tableCellEditor}>
        <input
          className={`${styles.cellInput} ${styles.tableTypedInput}`}
          type="datetime-local"
          defaultValue={toDateTimeInputValue(value)}
          onBlur={(e) => {
            const target = e.currentTarget
            const nextValue = target.value || null
            const result = onCommit(row, column.name, nextValue, column.dataType, () => {
              target.value = toDateTimeInputValue(value)
            })
            if (result === 'unchanged') target.value = toDateTimeInputValue(value)
          }}
        />
      </div>
    )
  }

  if (isJsonColumn(column.dataType)) {
    return (
      <div className={styles.tableCellEditor}>
        <span className={styles.tableCellKind}>JSON</span>
        <button
          type="button"
          className={styles.jsonbPreviewButton}
          onClick={() => onOpenCellView(row, column)}
          title="Click to view JSON (double-click cell)"
        >
          <code className={styles.jsonbPreviewText}>{truncate(formatJsonbPreview(value), 150)}</code>
        </button>
      </div>
    )
  }

  const editorKind = getEditorKind(column.dataType)
  const text = String(value ?? '')
  return (
    <div className={styles.tableCellEditor}>
      {editorKind ? <span className={styles.tableCellKind}>{editorKind.toUpperCase()}</span> : null}
      <input
        className={`${styles.cellInput} ${styles.tableTypedInput}`}
        defaultValue={text}
        onBlur={(e) => {
          const target = e.currentTarget
          const result = onCommit(row, column.name, target.value, column.dataType, () => {
            target.value = text
          })
          if (result === 'unchanged') target.value = text
        }}
      />
    </div>
  )
}
