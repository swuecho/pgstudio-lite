import { useState, type FocusEvent } from 'react'
import { ForeignKeyCombobox } from './ForeignKeyCombobox'
import type { ColumnInfo, RowData } from './types'
import styles from './TableEditorStyles.module.css'

type CommitFn = (
  row: RowData,
  column: string,
  nextValue: unknown,
  dataType: string,
  onCancel?: () => void
) => 'unchanged' | 'pending'

type CellForeignKeyEditorProps = {
  connectionName: string
  column: ColumnInfo
  row: RowData
  onCommit: CommitFn
}

/**
 * Inline editor for a foreign-key cell: lets the user pick an existing value
 * from the referenced table via the combobox and commits on focus-out, matching
 * the blur-to-save behaviour of the grid's other typed inputs.
 */
export function CellForeignKeyEditor({ connectionName, column, row, onCommit }: CellForeignKeyEditorProps) {
  const initial = row[column.name]
  const initialText = initial === null || initial === undefined ? '' : String(initial)
  const [value, setValue] = useState(initialText)

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    // Only commit when focus leaves the editor entirely, not when moving between
    // its internal elements (the combobox input and its portaled dropdown both
    // keep focus within the field while interacting).
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    const next = value === '' ? null : value
    const result = onCommit(row, column.name, next, column.dataType, () => setValue(initialText))
    if (result === 'unchanged') setValue(initialText)
  }

  return (
    <div className={styles.tableCellEditor} onBlur={handleBlur}>
      <ForeignKeyCombobox
        column={column}
        connectionName={connectionName}
        value={value}
        onChange={setValue}
      />
    </div>
  )
}
