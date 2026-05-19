import { useState } from 'react'
import type { RefObject } from 'react'
import { ColumnInfo, RowData, RowKey } from './types'
import { ColumnsSelector } from './ColumnsSelector'
import { FilterPopover } from './FilterPopover'
import { JsonbCellEditor } from './JsonbCellEditor'
import { InsertRowModal } from './InsertRowModal'
import { CopyableCellValue } from '../shared/CopyableCellValue'
import type { TableFilterMode } from '../../lib/table-filter'
import styles from './TableEditorStyles.module.css'

type TableGridPanelProps = {
  columns: ColumnInfo[]
  rows: RowData[]
  editableColumns: ColumnInfo[]
  sortBy: string
  sortOrder: 'asc' | 'desc'
  filterColumn: string
  filterMode: TableFilterMode
  filterValue: string
  filterValueInputRef: RefObject<HTMLInputElement | null>
  pageSize: number
  page: number
  totalRows: number
  readOnlyTable: boolean
  visibleColumns: string[]
  onChangeSortBy: (value: string) => void
  onChangeSortOrder: (value: 'asc' | 'desc') => void
  onChangeFilterColumn: (value: string) => void
  onChangeFilterMode: (value: TableFilterMode) => void
  onChangeFilterValue: (value: string) => void
  onClearFilters: () => void
  onChangePageSize: (value: number) => void
  onUpdateCell: (rowKey: RowKey | null, column: string, value: unknown) => void
  onDeleteRow: (rowKey: RowKey | null) => void
  onInsertRow: (values: Record<string, unknown>) => Promise<boolean>
  onPrevPage: () => void
  onNextPage: () => void
  onToggleVisibleColumn: (columnName: string) => void
  onShowAllColumns: () => void
  onHideAllColumns: () => void
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
  filterValueInputRef,
  pageSize,
  page,
  totalRows,
  readOnlyTable,
  visibleColumns,
  onChangeSortBy,
  onChangeSortOrder,
  onChangeFilterColumn,
  onChangeFilterMode,
  onChangeFilterValue,
  onClearFilters,
  onChangePageSize,
  onUpdateCell,
  onDeleteRow,
  onInsertRow,
  onPrevPage,
  onNextPage,
  onToggleVisibleColumn,
  onShowAllColumns,
  onHideAllColumns,
}: TableGridPanelProps) {
  const [dialog, setDialog] = useState<GridDialogState | null>(null)
  const [jsonbEditCell, setJsonbEditCell] = useState<{row: RowData, column: string} | null>(null)
  const [showInsertRow, setShowInsertRow] = useState(false)

  function closeDialog() {
    setDialog(null)
  }

  function closeJsonbEditor() {
    setJsonbEditCell(null)
  }

  function openJsonbEditor(row: RowData, column: string) {
    setJsonbEditCell({ row, column })
  }

  function handleJsonbSave(value: unknown) {
    if (jsonbEditCell) {
      const { row, column } = jsonbEditCell
      const colInfo = columns.find(c => c.name === column)
      if (colInfo) {
        onUpdateCell(row._rowKey, column, value)
      }
    }
    closeJsonbEditor()
  }

  function formatRowKey(rowKey: RowKey | null) {
    if (!rowKey) return 'Unavailable'
    try {
      return JSON.stringify(rowKey)
    } catch {
      return String(rowKey)
    }
  }

  function formatJsonbPreview(value: unknown): string {
    if (value === null || value === undefined) return 'null'
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        return JSON.stringify(parsed, null, 2)
      } catch {
        return value
      }
    }
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
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
        `Row: ${formatRowKey(row._rowKey)}`,
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
        onUpdateCell(row._rowKey, column, nextValue)
      },
      onCancel,
    })
    return 'pending' as const
  }

  // Filter columns based on visibleColumns selection
  // If no columns are selected, show all columns (backward compatible)
  const matchedVisibleColumns =
    visibleColumns.length > 0 ? columns.filter((col) => visibleColumns.includes(col.name)) : columns
  const displayColumns = matchedVisibleColumns.length > 0 ? matchedVisibleColumns : columns

  return (
    <>
      <div className={styles.tableGridWrap}>
        <div className={styles.tableToolbar}>
          <div className={styles.toolbarGroup}>
            <ColumnsSelector
              columns={columns}
              visibleColumns={visibleColumns}
              onToggleColumn={onToggleVisibleColumn}
              onShowAll={onShowAllColumns}
              onHideAll={onHideAllColumns}
            />
          </div>

          <div className={styles.toolbarSpacer} aria-hidden="true" />

          <div className={styles.toolbarGroup}>
            <span className={styles.toolbarGroupLabel}>Sort</span>
            <select
              className={styles.toolbarSortBy}
              value={sortBy}
              onChange={(e) => onChangeSortBy(e.target.value)}
              title={sortBy ? `Sort: ${sortBy}` : 'Default order'}
              aria-label="Sort column"
            >
              <option value="">Order</option>
              {columns.map((col) => (
                <option key={`sort-${col.name}`} value={col.name}>
                  {col.name}
                </option>
              ))}
            </select>
            <select
              className={styles.toolbarSortOrder}
              value={sortOrder}
              onChange={(e) => onChangeSortOrder(e.target.value as 'asc' | 'desc')}
              aria-label="Sort direction"
            >
              <option value="asc">ASC</option>
              <option value="desc">DESC</option>
            </select>
          </div>

          <div className={styles.toolbarGroup}>
            <FilterPopover
              columns={columns}
              filterColumn={filterColumn}
              filterMode={filterMode}
              filterValue={filterValue}
              filterValueInputRef={filterValueInputRef}
              onChangeFilterColumn={onChangeFilterColumn}
              onChangeFilterMode={onChangeFilterMode}
              onChangeFilterValue={onChangeFilterValue}
              onClearFilters={onClearFilters}
            />
          </div>

          <div className={styles.toolbarGroup}>
            <span className={styles.toolbarGroupLabel}>Rows</span>
            <select
              className={styles.toolbarPageSize}
              value={String(pageSize)}
              onChange={(e) => onChangePageSize(Number(e.target.value) || 50)}
              aria-label="Rows per page"
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="250">250</option>
              <option value="500">500</option>
            </select>
          </div>

          {!readOnlyTable ? (
            <div className={styles.toolbarGroup}>
              <button
                className="btn small primary"
                onClick={() => setShowInsertRow(true)}
                disabled={columns.length === 0}
              >
                Add row
              </button>
            </div>
          ) : null}
        </div>
        <div className={styles.tableScrollArea}>
          <table className={styles.tableGridTable}>
            <thead>
              <tr>
                {displayColumns.map((col) => (
                  <th key={col.name}>{col.name}</th>
                ))}
                {!readOnlyTable ? <th className={styles.tableActionsCol}>actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row._rowKey ? formatRowKey(row._rowKey) : `row-${rowIndex}`}>
                  {displayColumns.map((col) => {
                  const readOnly = readOnlyTable || !editableColumns.some((c) => c.name === col.name)
                  const editorKind = getEditorKind(col.dataType)
                  return (
                    <td key={col.name}>
                      {readOnly ? (
                        <CopyableCellValue text={String(row[col.name] ?? '')} />
                      ) : isBooleanColumn(col.dataType) ? (
                        <div className={styles.tableCellEditor}>
                          <button
                            className={`${styles.tableBoolToggle} ${row[col.name] === true ? styles.tableBoolToggleOn : ''}`}
                            onClick={() => {
                              commitRowChange(row, col.name, row[col.name] !== true, col.dataType)
                            }}
                            title={`Toggle ${col.name}`}
                          >
                            {row[col.name] === true ? 'TRUE' : 'FALSE'}
                          </button>
                        </div>
                      ) : isDateColumn(col.dataType) ? (
                        <div className={styles.tableCellEditor}>
                          <input
                            className={`${styles.cellInput} ${styles.tableTypedInput}`}
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
                        <div className={styles.tableCellEditor}>
                          <input
                            className={`${styles.cellInput} ${styles.tableTypedInput}`}
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
                        <div className={styles.tableCellEditor}>
                          <span className={styles.tableCellKind}>JSON</span>
                          <button
                            className={styles.jsonbPreviewButton}
                            onClick={() => openJsonbEditor(row, col.name)}
                            title="Click to edit JSON"
                          >
                            <code className={styles.jsonbPreviewText}>
                              {truncate(formatJsonbPreview(row[col.name]), 150)}
                            </code>
                          </button>
                        </div>
                      ) : (
                        <div className={styles.tableCellEditor}>
                          {editorKind ? <span className={styles.tableCellKind}>{editorKind.toUpperCase()}</span> : null}
                          <input
                            className={`${styles.cellInput} ${styles.tableTypedInput}`}
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
                  {!readOnlyTable ? (
                    <td className={styles.tableActionsCol}>
                      <button
                        className="btn small danger"
                        onClick={() => {
                          const rowPreview = truncate(previewValue(row), 500)
                          setDialog({
                            title: 'Preview row delete',
                            lines: [`Row: ${formatRowKey(row._rowKey)}`, `Data: ${rowPreview}`],
                            confirmLabel: 'Delete row',
                            cancelLabel: 'Cancel',
                            onConfirm: () => onDeleteRow(row._rowKey),
                          })
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.tablePagination}>
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

      {showInsertRow ? (
        <InsertRowModal
          columns={columns}
          onClose={() => setShowInsertRow(false)}
          onSubmit={(values) => {
            void onInsertRow(values).then((ok) => {
              if (ok) setShowInsertRow(false)
            })
          }}
        />
      ) : null}

      {jsonbEditCell ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className={`modal-card ${styles.jsonbEditorModal}`}>
            <div className="modal-head">
              <div className="nav-title">Edit JSONB: {jsonbEditCell.column}</div>
              <button className="btn small" onClick={closeJsonbEditor}>
                Cancel
              </button>
            </div>
            <div className="modal-body">
              <JsonbCellEditor
                value={jsonbEditCell.row[jsonbEditCell.column]}
                onSave={handleJsonbSave}
                onCancel={closeJsonbEditor}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
