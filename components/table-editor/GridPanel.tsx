import { useState } from 'react'
import { ColumnInfo, RowData } from './types'

type TableGridPanelProps = {
  columns: ColumnInfo[]
  rows: RowData[]
  editableColumns: ColumnInfo[]
  sortBy: string
  sortOrder: 'asc' | 'desc'
  filterColumn: string
  filterMode: 'contains' | 'equals'
  filterValue: string
  pageSize: number
  page: number
  totalRows: number
  readOnlyConnection: boolean
  onChangeSortBy: (value: string) => void
  onChangeSortOrder: (value: 'asc' | 'desc') => void
  onChangeFilterColumn: (value: string) => void
  onChangeFilterMode: (value: 'contains' | 'equals') => void
  onChangeFilterValue: (value: string) => void
  onChangePageSize: (value: number) => void
  onUpdateCell: (ctid: string, column: string, value: unknown) => void
  onDeleteRow: (ctid: string) => void
  onPrevPage: () => void
  onNextPage: () => void
}

type GridDialogState = {
  title: string
  lines: string[]
  confirmLabel?: string
  cancelLabel?: string
  hideCancel?: boolean
  onConfirm: () => void
  onCancel?: () => void
}

export function TableGridPanel({
  columns,
  rows,
  editableColumns,
  sortBy,
  sortOrder,
  filterColumn,
  filterMode,
  filterValue,
  pageSize,
  page,
  totalRows,
  readOnlyConnection,
  onChangeSortBy,
  onChangeSortOrder,
  onChangeFilterColumn,
  onChangeFilterMode,
  onChangeFilterValue,
  onChangePageSize,
  onUpdateCell,
  onDeleteRow,
  onPrevPage,
  onNextPage,
}: TableGridPanelProps) {
  const [dialog, setDialog] = useState<GridDialogState | null>(null)

  function closeDialog() {
    setDialog(null)
  }

  function previewValue(value: unknown) {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (typeof value === 'string') return value
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  function truncate(value: string, max = 220) {
    return value.length > max ? `${value.slice(0, max)}...` : value
  }

  function isBooleanColumn(dataType: string) {
    return dataType.toLowerCase() === 'boolean'
  }

  function isJsonColumn(dataType: string) {
    const lower = dataType.toLowerCase()
    return lower === 'json' || lower === 'jsonb'
  }

  function isDateColumn(dataType: string) {
    return dataType.toLowerCase() === 'date'
  }

  function isDateTimeColumn(dataType: string) {
    const lower = dataType.toLowerCase()
    return lower === 'timestamp without time zone' || lower === 'timestamp with time zone'
  }

  function getEditorKind(dataType: string) {
    if (isBooleanColumn(dataType)) return 'bool'
    if (isDateColumn(dataType)) return 'date'
    if (isDateTimeColumn(dataType)) return 'datetime'
    if (isJsonColumn(dataType)) return 'json'
    return null
  }

  function normalizeDateValue(value: unknown) {
    if (value === null || value === undefined || value === '') return null
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
    const parsed = new Date(String(value))
    if (Number.isNaN(parsed.getTime())) return String(value)
    return parsed.toISOString().slice(0, 10)
  }

  function normalizeDateTimeValue(value: unknown) {
    if (value === null || value === undefined || value === '') return null
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value
    const parsed = new Date(String(value))
    if (Number.isNaN(parsed.getTime())) return String(value)
    const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
    return local.toISOString().slice(0, 16)
  }

  function normalizeJsonValue(value: unknown) {
    if (value === null || value === undefined || value === '') return null
    if (typeof value === 'string') {
      try {
        return JSON.stringify(JSON.parse(value))
      } catch {
        return value.trim()
      }
    }
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  function normalizeValueForComparison(value: unknown, dataType: string) {
    if (isBooleanColumn(dataType)) return value === true
    if (isDateColumn(dataType)) return normalizeDateValue(value)
    if (isDateTimeColumn(dataType)) return normalizeDateTimeValue(value)
    if (isJsonColumn(dataType)) return normalizeJsonValue(value)
    if (value === null || value === undefined) return ''
    return String(value)
  }

  function toDateInputValue(value: unknown) {
    if (typeof value !== 'string' || !value) return ''
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return ''
    return parsed.toISOString().slice(0, 10)
  }

  function toDateTimeInputValue(value: unknown) {
    if (typeof value !== 'string' || !value) return ''
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return ''
    const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
    return local.toISOString().slice(0, 16)
  }

  function confirmRowChange(row: RowData, column: string, before: unknown, after: unknown) {
    return {
      title: 'Preview row change',
      lines: [
        `Row: ${row._ctid}`,
        `Column: ${column}`,
        `Before: ${truncate(previewValue(before))}`,
        `After: ${truncate(previewValue(after))}`,
      ],
      confirmLabel: 'Apply',
      cancelLabel: 'Cancel',
    }
  }

  function commitRowChange(
    row: RowData,
    column: string,
    nextValue: unknown,
    dataType: string,
    onCancel?: () => void
  ) {
    const previous = row[column]
    const prevNormalized = normalizeValueForComparison(previous, dataType)
    const nextNormalized = normalizeValueForComparison(nextValue, dataType)
    if (prevNormalized === nextNormalized) return 'unchanged' as const
    const config = confirmRowChange(row, column, previous, nextValue)
    setDialog({
      ...config,
      onConfirm: () => {
        onUpdateCell(row._ctid, column, nextValue)
      },
      onCancel,
    })
    return 'pending' as const
  }

  return (
    <>
      <div className="table-grid-wrap">
        <div className="table-toolbar">
          <select value={sortBy} onChange={(e) => onChangeSortBy(e.target.value)}>
            <option value="_ctid">Default order</option>
            {columns.map((col) => (
              <option key={`sort-${col.name}`} value={col.name}>
                Sort: {col.name}
              </option>
            ))}
          </select>
          <select value={sortOrder} onChange={(e) => onChangeSortOrder(e.target.value as 'asc' | 'desc')}>
            <option value="asc">ASC</option>
            <option value="desc">DESC</option>
          </select>
          <select value={filterColumn} onChange={(e) => onChangeFilterColumn(e.target.value)}>
            <option value="">Filter column</option>
            {columns.map((col) => (
              <option key={`filter-${col.name}`} value={col.name}>
                {col.name}
              </option>
            ))}
          </select>
          <select value={filterMode} onChange={(e) => onChangeFilterMode(e.target.value as 'contains' | 'equals')}>
            <option value="contains">contains</option>
            <option value="equals">equals</option>
          </select>
          <input
            className="cell-input"
            placeholder="Filter value"
            value={filterValue}
            onChange={(e) => onChangeFilterValue(e.target.value)}
          />
          <select value={String(pageSize)} onChange={(e) => onChangePageSize(Number(e.target.value) || 50)}>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.name}>{col.name}</th>
              ))}
              <th>actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row._ctid}>
                {columns.map((col) => {
                  if (col.name === '_ctid') {
                    return (
                      <td key={col.name}>
                        <code>{String(row[col.name] ?? '')}</code>
                      </td>
                    )
                  }
                  const readOnly = readOnlyConnection || !editableColumns.some((c) => c.name === col.name)
                  const editorKind = getEditorKind(col.dataType)
                  return (
                    <td key={col.name}>
                      {readOnly ? (
                        <code>{String(row[col.name] ?? '')}</code>
                      ) : isBooleanColumn(col.dataType) ? (
                        <div className="table-cell-editor">
                          <span className="table-cell-kind">BOOL</span>
                          <button
                            className={`table-bool-toggle ${row[col.name] === true ? 'on' : 'off'}`}
                            onClick={() => {
                              commitRowChange(row, col.name, row[col.name] !== true, col.dataType)
                            }}
                            title={`Toggle ${col.name}`}
                          >
                            {row[col.name] === true ? 'TRUE' : 'FALSE'}
                          </button>
                        </div>
                      ) : isDateColumn(col.dataType) ? (
                        <div className="table-cell-editor">
                          <span className="table-cell-kind">DATE</span>
                          <input
                            className="cell-input table-typed-input"
                            type="date"
                            defaultValue={toDateInputValue(row[col.name])}
                            onBlur={(e) => {
                              const target = e.currentTarget
                              const raw = target.value
                              const nextValue = raw || null
                              const result = commitRowChange(row, col.name, nextValue, col.dataType, () => {
                                target.value = toDateInputValue(row[col.name])
                              })
                              if (result === 'unchanged') target.value = toDateInputValue(row[col.name])
                            }}
                          />
                        </div>
                      ) : isDateTimeColumn(col.dataType) ? (
                        <div className="table-cell-editor">
                          <span className="table-cell-kind">TIME</span>
                          <input
                            className="cell-input table-typed-input"
                            type="datetime-local"
                            defaultValue={toDateTimeInputValue(row[col.name])}
                            onBlur={(e) => {
                              const target = e.currentTarget
                              const raw = target.value
                              const nextValue = raw || null
                              const result = commitRowChange(row, col.name, nextValue, col.dataType, () => {
                                target.value = toDateTimeInputValue(row[col.name])
                              })
                              if (result === 'unchanged') target.value = toDateTimeInputValue(row[col.name])
                            }}
                          />
                        </div>
                      ) : isJsonColumn(col.dataType) ? (
                        <div className="table-cell-editor">
                          <span className="table-cell-kind">JSON</span>
                          <textarea
                            className="cell-input table-json-input"
                            rows={3}
                            defaultValue={
                              typeof row[col.name] === 'string'
                                ? String(row[col.name])
                                : JSON.stringify(row[col.name] ?? null, null, 2)
                            }
                            onBlur={(e) => {
                              const target = e.currentTarget
                              const raw = target.value.trim()
                              try {
                                const parsed = raw ? JSON.parse(raw) : null
                                const result = commitRowChange(row, col.name, parsed, col.dataType, () => {
                                  target.value =
                                    typeof row[col.name] === 'string'
                                      ? String(row[col.name])
                                      : JSON.stringify(row[col.name] ?? null, null, 2)
                                })
                                if (result === 'unchanged') {
                                  target.value =
                                    typeof row[col.name] === 'string'
                                      ? String(row[col.name])
                                      : JSON.stringify(row[col.name] ?? null, null, 2)
                                }
                              } catch {
                                setDialog({
                                  title: 'Invalid JSON value',
                                  lines: ['Please enter valid JSON before saving this cell.'],
                                  confirmLabel: 'OK',
                                  hideCancel: true,
                                  onConfirm: () => {
                                    target.value =
                                      typeof row[col.name] === 'string'
                                        ? String(row[col.name])
                                        : JSON.stringify(row[col.name] ?? null, null, 2)
                                  },
                                })
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <div className="table-cell-editor">
                          {editorKind ? <span className="table-cell-kind">{editorKind.toUpperCase()}</span> : null}
                          <input
                            className="cell-input table-typed-input"
                            defaultValue={String(row[col.name] ?? '')}
                            onBlur={(e) => {
                              const target = e.currentTarget
                              const nextValue = target.value
                              const result = commitRowChange(row, col.name, nextValue, col.dataType, () => {
                                target.value = String(row[col.name] ?? '')
                              })
                              if (result === 'unchanged') target.value = String(row[col.name] ?? '')
                            }}
                          />
                        </div>
                      )}
                    </td>
                  )
                })}
                <td>
                  <button
                    className="btn small danger"
                    disabled={readOnlyConnection}
                    onClick={() => {
                      const rowPreview = truncate(previewValue(row), 500)
                      setDialog({
                        title: 'Preview row delete',
                        lines: [`Row: ${row._ctid}`, `Data: ${rowPreview}`],
                        confirmLabel: 'Delete row',
                        cancelLabel: 'Cancel',
                        onConfirm: () => onDeleteRow(row._ctid),
                      })
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="table-pagination">
          <span className="history-meta">
            {totalRows} rows total · page {page + 1} / {Math.max(1, Math.ceil(totalRows / pageSize))}
          </span>
          <div className="history-actions">
            <button className="btn small" disabled={page === 0} onClick={onPrevPage}>
              Prev
            </button>
            <button className="btn small" disabled={(page + 1) * pageSize >= totalRows} onClick={onNextPage}>
              Next
            </button>
          </div>
        </div>
      </div>

      {dialog ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card table-confirm-modal">
            <div className="modal-head">
              <div className="nav-title">{dialog.title}</div>
              <button
                className="btn small"
                onClick={() => {
                  dialog.onCancel?.()
                  closeDialog()
                }}
              >
                Close
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-section">
                {dialog.lines.map((line, index) => (
                  <div key={`${line}-${index}`} className="history-query">
                    {line}
                  </div>
                ))}
                <div className="history-actions">
                  {!dialog.hideCancel ? (
                    <button
                      className="btn small"
                      onClick={() => {
                        dialog.onCancel?.()
                        closeDialog()
                      }}
                    >
                      {dialog.cancelLabel || 'Cancel'}
                    </button>
                  ) : null}
                  <button
                    className="btn small primary"
                    onClick={() => {
                      dialog.onConfirm()
                      closeDialog()
                    }}
                  >
                    {dialog.confirmLabel || 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
