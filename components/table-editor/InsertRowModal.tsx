import { useMemo, useState } from 'react'
import {
  canGenerateValue,
  generateColumnValue,
  isBooleanColumn,
  isJsonColumn,
  isNumericColumn,
} from '@/lib/table-column-kind'
import { ForeignKeyCombobox } from './ForeignKeyCombobox'
import type { ColumnInfo } from './types'
import styles from './TableEditorStyles.module.css'

type InsertRowModalProps = {
  columns: ColumnInfo[]
  connectionName: string
  onClose: () => void
  onSubmit: (values: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
}

function emptyDraft(columns: ColumnInfo[]) {
  return Object.fromEntries(columns.map((column) => [column.name, '']))
}

function fieldPlaceholder(column: ColumnInfo) {
  if (column.hasDefault) return 'default value'
  return column.isNullable ? 'optional' : 'required'
}

export function InsertRowModal({ columns, connectionName, onClose, onSubmit }: InsertRowModalProps) {
  const insertableColumns = useMemo(() => columns.filter((column) => !column.isIdentity), [columns])
  const [draft, setDraft] = useState<Record<string, string>>(() => emptyDraft(insertableColumns))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateField(name: string, value: string) {
    setDraft((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit() {
    if (submitting) return
    setError(null)
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
    setSubmitting(true)
    const result = await onSubmit(values)
    if (result.ok) {
      onClose()
      return
    }
    setError(result.error || 'Failed to insert row')
    setSubmitting(false)
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
            Leave fields blank to omit them. Identity and default columns are filled by the database.
          </p>
          <div className={styles.insertRowFields}>
            {insertableColumns.map((column) => (
              <label key={column.name} className={styles.insertRowField}>
                <span className={styles.insertRowFieldLabel}>
                  <span>
                    {column.name}
                    {!column.isNullable && !column.hasDefault ? ' *' : ''}
                    {column.hasDefault ? <span className={styles.insertRowDefaultTag}> default</span> : null}
                  </span>
                  {!column.foreignKey && canGenerateValue(column.dataType) ? (
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => {
                        const generated = generateColumnValue(column.dataType)
                        if (generated !== null) updateField(column.name, generated)
                      }}
                    >
                      Generate
                    </button>
                  ) : null}
                </span>
                {column.foreignKey ? (
                  <ForeignKeyCombobox
                    column={column}
                    connectionName={connectionName}
                    value={draft[column.name] || ''}
                    onChange={(value) => updateField(column.name, value)}
                  />
                ) : isBooleanColumn(column.dataType) ? (
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
                    placeholder={fieldPlaceholder(column)}
                    onChange={(event) => updateField(column.name, event.target.value)}
                  />
                )}
              </label>
            ))}
          </div>
          {error ? (
            <p className={styles.insertRowError} role="alert">
              {error}
            </p>
          ) : null}
          <div className="history-actions">
            <button className="btn small primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Inserting…' : 'Insert row'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
