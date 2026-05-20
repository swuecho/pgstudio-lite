import { useMemo, useState } from 'react'
import { isBooleanColumn, isJsonColumn, isNumericColumn } from '../../lib/table-column-kind'
import type { ColumnInfo } from './types'
import styles from './TableEditorStyles.module.css'

type InsertRowModalProps = {
  columns: ColumnInfo[]
  onClose: () => void
  onSubmit: (values: Record<string, unknown>) => void
}

function emptyDraft(columns: ColumnInfo[]) {
  return Object.fromEntries(columns.map((column) => [column.name, '']))
}

export function InsertRowModal({ columns, onClose, onSubmit }: InsertRowModalProps) {
  const insertableColumns = useMemo(() => columns.filter((column) => !column.isIdentity), [columns])
  const [draft, setDraft] = useState<Record<string, string>>(() => emptyDraft(insertableColumns))

  function updateField(name: string, value: string) {
    setDraft((current) => ({ ...current, [name]: value }))
  }

  function handleSubmit() {
    const values: Record<string, unknown> = {}
    for (const column of insertableColumns) {
      const raw = draft[column.name]?.trim() ?? ''
      if (!raw) continue
      if (isBooleanColumn(column.dataType)) {
        values[column.name] = raw.toLowerCase() === 'true'
        continue
      }
      if (isNumericColumn(column.dataType)) {
        const parsed = Number(raw)
        if (!Number.isFinite(parsed)) continue
        values[column.name] = parsed
        continue
      }
      if (isJsonColumn(column.dataType)) {
        try {
          values[column.name] = JSON.parse(raw)
        } catch {
          values[column.name] = raw
        }
        continue
      }
      values[column.name] = raw
    }
    onSubmit(values)
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className={`modal-card ${styles.insertRowModal}`}>
        <div className="modal-head">
          <div className="nav-title">Insert row</div>
          <button className="btn small" onClick={onClose}>
            Cancel
          </button>
        </div>
        <div className="modal-body">
          <p className={styles.insertRowHint}>
            Leave fields blank to omit them. Identity columns are filled by the database.
          </p>
          <div className={styles.insertRowFields}>
            {insertableColumns.map((column) => (
              <label key={column.name} className={styles.insertRowField}>
                <span>
                  {column.name}
                  {!column.isNullable ? ' *' : ''}
                </span>
                {isBooleanColumn(column.dataType) ? (
                  <select
                    value={draft[column.name] || ''}
                    onChange={(event) => updateField(column.name, event.target.value)}
                  >
                    <option value="">(omit)</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : isJsonColumn(column.dataType) ? (
                  <textarea
                    value={draft[column.name] || ''}
                    placeholder="JSON value"
                    onChange={(event) => updateField(column.name, event.target.value)}
                  />
                ) : (
                  <input
                    className={styles.cellInput}
                    value={draft[column.name] || ''}
                    placeholder={column.isNullable ? 'optional' : 'required'}
                    onChange={(event) => updateField(column.name, event.target.value)}
                  />
                )}
              </label>
            ))}
          </div>
          <div className="history-actions">
            <button className="btn small primary" onClick={handleSubmit}>
              Insert row
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
