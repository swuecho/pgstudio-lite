import { useState, type ReactNode } from 'react'
import type { RefObject } from 'react'
import { ColumnInfo, RowData, RowKey } from './types'
import { copyableCellDisplayProps } from '@/lib/format-uuid-display'
import { isJsonColumn } from '@/lib/table-column-kind'
import { InsertRowModal } from './InsertRowModal'
import { ImportRowsModal } from './ImportRowsModal'
import { TableDdlModal } from './TableDdlModal'
import { CellContentPanel } from '../shared/CellContentPanel'
import { CopyableCellValue } from '../shared/CopyableCellValue'
import { canOpenCellViewer } from '@/lib/format-cell-content'
import { buildTraceHref } from '@/lib/trace-url'
import { useGridKeyboardNav } from '@/hooks/useGridKeyboardNav'
import { hasActiveTableFilter } from '@/lib/table-filter'
import type { TableFilterMode } from '@/lib/table-filter'
import { ForeignKeyCell } from './ForeignKeyCell'
import { formatForeignKeyHeaderTitle } from './foreignKeyUtils'
import { GridCellEditor } from './GridCellEditor'
import { GridConfirmDialog } from './GridConfirmDialog'
import { GridToolbar } from './GridToolbar'
import { JsonbEditModal } from './JsonbEditModal'
import { formatRowKey } from './gridCellValues'
import { useGridRowChanges } from './useGridRowChanges'
import styles from './TableEditorStyles.module.css'

type TableGridPanelProps = {
  connectionName: string
  schema: string
  table: string
  columns: ColumnInfo[]
  rows: RowData[]
  editableColumns: ColumnInfo[]
  sortBy: string
  sortOrder: 'asc' | 'desc'
  filterColumn: string
  filterMode: TableFilterMode
  filterValue: string
  filterValueEnd: string
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
  onChangeFilterValueEnd: (value: string) => void
  onClearFilters: () => void
  onChangePageSize: (value: number) => void
  onUpdateCell: (rowKey: RowKey | null, column: string, value: unknown) => void
  onDeleteRow: (rowKey: RowKey | null) => void
  onInsertRow: (values: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
  onImportRows: (columns: string[], rows: unknown[][]) => Promise<{ inserted: number }>
  onPrevPage: () => void
  onNextPage: () => void
  onToggleVisibleColumn: (columnName: string) => void
  onShowAllColumns: () => void
  onHideAllColumns: () => void
}

/**
 * The table editor's main area: toolbar, the row grid with per-cell editors,
 * pagination, the cell content side panel, and the modals (confirm, DDL,
 * insert, import, JSONB edit). Editing flows through `useGridRowChanges`.
 */
export function TableGridPanel(props: TableGridPanelProps) {
  const {
    connectionName,
    schema,
    table,
    columns,
    rows,
    editableColumns,
    filterColumn,
    filterMode,
    filterValue,
    filterValueEnd,
    pageSize,
    page,
    totalRows,
    readOnlyTable,
    visibleColumns,
    onUpdateCell,
    onDeleteRow,
    onInsertRow,
    onImportRows,
    onPrevPage,
    onNextPage,
  } = props

  const { dialog, closeDialog, commitRowChange, confirmDeleteRow } = useGridRowChanges({
    onUpdateCell,
    onDeleteRow,
  })
  const [jsonbEditCell, setJsonbEditCell] = useState<{ row: RowData; column: string } | null>(null)
  const [cellView, setCellView] = useState<{ row: RowData; column: ColumnInfo } | null>(null)
  const [showInsertRow, setShowInsertRow] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showTableDdl, setShowTableDdl] = useState(false)

  function wrapFkCell(column: ColumnInfo, row: RowData, content: ReactNode) {
    if (!column.foreignKey || !connectionName) return content
    return (
      <ForeignKeyCell connectionName={connectionName} column={column} row={row}>
        {content}
      </ForeignKeyCell>
    )
  }

  function openCellView(row: RowData, column: ColumnInfo) {
    if (!canOpenCellViewer(column.dataType, row[column.name])) return
    setCellView({ row, column })
  }

  function getCellViewKey(row: RowData, column: ColumnInfo) {
    return `${column.name}:${formatRowKey(row._rowKey)}`
  }

  function handleJsonbSave(value: unknown) {
    if (jsonbEditCell) {
      const { row, column } = jsonbEditCell
      if (columns.some((c) => c.name === column)) {
        onUpdateCell(row._rowKey, column, value)
      }
    }
    setJsonbEditCell(null)
  }

  // Filter columns based on visibleColumns selection
  // If no columns are selected, show all columns (backward compatible)
  const matchedVisibleColumns =
    visibleColumns.length > 0 ? columns.filter((col) => visibleColumns.includes(col.name)) : columns
  const displayColumns = matchedVisibleColumns.length > 0 ? matchedVisibleColumns : columns

  const {
    containerRef: gridRef,
    cellProps,
    onKeyDown: onGridKeyDown,
  } = useGridKeyboardNav({ rowCount: rows.length, colCount: displayColumns.length })
  const viewingCellKey = cellView ? getCellViewKey(cellView.row, cellView.column) : null
  const canEditViewedJson =
    cellView &&
    !readOnlyTable &&
    editableColumns.some((column) => column.name === cellView.column.name) &&
    isJsonColumn(cellView.column.dataType)

  return (
    <>
      <div className={`${styles.tablePage} ${cellView ? styles.tablePageWithPanel : ''}`.trim()}>
        <div className={styles.tableGridWrap}>
          <GridToolbar
            connectionName={connectionName}
            table={table}
            columns={columns}
            visibleColumns={visibleColumns}
            sortBy={props.sortBy}
            sortOrder={props.sortOrder}
            filterColumn={filterColumn}
            filterMode={filterMode}
            filterValue={filterValue}
            filterValueEnd={filterValueEnd}
            filterValueInputRef={props.filterValueInputRef}
            totalRows={totalRows}
            pageSize={pageSize}
            readOnlyTable={readOnlyTable}
            onToggleVisibleColumn={props.onToggleVisibleColumn}
            onShowAllColumns={props.onShowAllColumns}
            onHideAllColumns={props.onHideAllColumns}
            onChangeSortBy={props.onChangeSortBy}
            onChangeSortOrder={props.onChangeSortOrder}
            onChangeFilterColumn={props.onChangeFilterColumn}
            onChangeFilterMode={props.onChangeFilterMode}
            onChangeFilterValue={props.onChangeFilterValue}
            onChangeFilterValueEnd={props.onChangeFilterValueEnd}
            onClearFilters={props.onClearFilters}
            onChangePageSize={props.onChangePageSize}
            onShowDdl={() => setShowTableDdl(true)}
            onImport={() => setShowImport(true)}
            onAddRow={() => setShowInsertRow(true)}
          />
          <div className={styles.tableScrollArea} ref={gridRef} onKeyDown={onGridKeyDown}>
            <table className={styles.tableGridTable}>
              <thead>
                <tr>
                  {displayColumns.map((col) => (
                    <th key={col.name}>
                      {col.name}
                      {col.isPrimaryKey ? (
                        <span className={styles.columnPkIcon} title="Primary key" aria-hidden>
                          PK
                        </span>
                      ) : null}
                      {col.foreignKey ? (
                        <span
                          className={styles.columnFkIcon}
                          title={formatForeignKeyHeaderTitle(col.foreignKey)}
                          aria-hidden
                        >
                          ↗
                        </span>
                      ) : null}
                    </th>
                  ))}
                  <th className={styles.tableActionsCol}>actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={row._rowKey ? formatRowKey(row._rowKey) : `row-${rowIndex}`}>
                    {displayColumns.map((col, colIndex) => {
                      const readOnly = readOnlyTable || !editableColumns.some((c) => c.name === col.name)
                      const cellValue = row[col.name]
                      const isViewable = canOpenCellViewer(col.dataType, cellValue)
                      const isViewing = viewingCellKey === getCellViewKey(row, col)
                      return (
                        <td
                          key={col.name}
                          className={
                            `${isViewable ? styles.tableCellViewable : ''} ${isViewing ? styles.tableCellViewing : ''}`.trim() ||
                            undefined
                          }
                          title={isViewable ? 'Double-click to view full content' : undefined}
                          onDoubleClick={() => {
                            if (isViewable) openCellView(row, col)
                          }}
                        >
                          {readOnly ? (
                            wrapFkCell(
                              col,
                              row,
                              <CopyableCellValue
                                {...copyableCellDisplayProps(cellValue, { dataType: col.dataType })}
                                {...cellProps(rowIndex, colIndex)}
                                ariaLabel={`${col.name}, row ${rowIndex + 1}`}
                              />
                            )
                          ) : (
                            <GridCellEditor
                              connectionName={connectionName}
                              column={col}
                              row={row}
                              onCommit={commitRowChange}
                              onOpenCellView={openCellView}
                            />
                          )}
                        </td>
                      )
                    })}
                    <td className={styles.tableActionsCol}>
                      <div className="history-actions">
                        {row._rowKey ? (
                          <a
                            className="btn small"
                            href={buildTraceHref({ connectionName, schema, table, pk: row._rowKey })}
                            target="_blank"
                            rel="noreferrer"
                            title="Trace foreign-key lineage from this row"
                          >
                            Trace
                          </a>
                        ) : null}
                        {!readOnlyTable ? (
                          <button className="btn small danger" onClick={() => confirmDeleteRow(row)}>
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <div className="empty-state">
                {!table
                  ? 'Select a table in the sidebar to browse its rows.'
                  : hasActiveTableFilter(filterColumn, filterMode, filterValue, filterValueEnd)
                    ? 'No rows match the current filter.'
                    : 'This table has no rows.'}
              </div>
            ) : null}
          </div>
          <div className={styles.tablePagination}>
            <span className="history-meta">
              {totalRows} rows total · page {page + 1} / {Math.max(1, Math.ceil(totalRows / pageSize))}
            </span>
            <div className="history-actions">
              <button className="btn small" disabled={page === 0} onClick={onPrevPage}>
                Prev
              </button>
              <button
                className="btn small"
                disabled={(page + 1) * pageSize >= totalRows}
                onClick={onNextPage}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {cellView ? (
          <CellContentPanel
            columnName={cellView.column.name}
            dataType={cellView.column.dataType}
            value={cellView.row[cellView.column.name]}
            contextLabel={formatRowKey(cellView.row._rowKey)}
            onClose={() => setCellView(null)}
            onEdit={
              canEditViewedJson
                ? () => {
                    setJsonbEditCell({ row: cellView.row, column: cellView.column.name })
                    setCellView(null)
                  }
                : undefined
            }
          />
        ) : null}
      </div>

      {dialog ? <GridConfirmDialog dialog={dialog} onClose={closeDialog} /> : null}

      {showTableDdl ? (
        <TableDdlModal
          connectionName={connectionName}
          schema={schema}
          table={table}
          onClose={() => setShowTableDdl(false)}
        />
      ) : null}

      {showInsertRow ? (
        <InsertRowModal
          columns={columns}
          connectionName={connectionName}
          onClose={() => setShowInsertRow(false)}
          onSubmit={onInsertRow}
        />
      ) : null}

      {showImport ? (
        <ImportRowsModal columns={columns} onClose={() => setShowImport(false)} onImport={onImportRows} />
      ) : null}

      {jsonbEditCell ? (
        <JsonbEditModal
          column={jsonbEditCell.column}
          value={jsonbEditCell.row[jsonbEditCell.column]}
          onSave={handleJsonbSave}
          onCancel={() => setJsonbEditCell(null)}
        />
      ) : null}
    </>
  )
}
