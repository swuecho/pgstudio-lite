import type { RefObject } from 'react'
import type { TableFilterMode } from '@/lib/table-filter'
import { ColumnsSelector } from './ColumnsSelector'
import { FilterPopover } from './FilterPopover'
import { SortPopover } from './SortPopover'
import type { ColumnInfo } from './types'
import styles from './TableEditorStyles.module.css'

type GridToolbarProps = {
  connectionName: string
  table: string
  columns: ColumnInfo[]
  visibleColumns: string[]
  sortBy: string
  sortOrder: 'asc' | 'desc'
  filterColumn: string
  filterMode: TableFilterMode
  filterValue: string
  filterValueEnd: string
  filterValueInputRef: RefObject<HTMLInputElement | null>
  totalRows: number
  pageSize: number
  readOnlyTable: boolean
  onToggleVisibleColumn: (columnName: string) => void
  onShowAllColumns: () => void
  onHideAllColumns: () => void
  onChangeSortBy: (value: string) => void
  onChangeSortOrder: (value: 'asc' | 'desc') => void
  onChangeFilterColumn: (value: string) => void
  onChangeFilterMode: (value: TableFilterMode) => void
  onChangeFilterValue: (value: string) => void
  onChangeFilterValueEnd: (value: string) => void
  onClearFilters: () => void
  onChangePageSize: (value: number) => void
  onShowDdl: () => void
  onImport: () => void
  onAddRow: () => void
}

/** Columns, DDL, sort, filter, page size, and the Import / Add row buttons. */
export function GridToolbar(props: GridToolbarProps) {
  const { columns, table, readOnlyTable } = props
  return (
    <div className={styles.tableToolbar}>
      <div className={styles.toolbarGroup}>
        <ColumnsSelector
          columns={columns}
          visibleColumns={props.visibleColumns}
          onToggleColumn={props.onToggleVisibleColumn}
          onShowAll={props.onShowAllColumns}
          onHideAll={props.onHideAllColumns}
        />
      </div>

      <div className={styles.toolbarSpacer} aria-hidden="true" />

      <div className={styles.toolbarGroup}>
        <button
          type="button"
          className="btn small"
          onClick={props.onShowDdl}
          disabled={!table}
          title="View CREATE TABLE / VIEW DDL with keys and indexes"
        >
          DDL
        </button>
      </div>

      <div className={styles.toolbarGroup}>
        <SortPopover
          columns={columns}
          sortBy={props.sortBy}
          sortOrder={props.sortOrder}
          onChangeSortBy={props.onChangeSortBy}
          onChangeSortOrder={props.onChangeSortOrder}
        />
      </div>

      <div className={styles.toolbarGroup}>
        <FilterPopover
          columns={columns}
          connectionName={props.connectionName}
          filterColumn={props.filterColumn}
          filterMode={props.filterMode}
          filterValue={props.filterValue}
          filterValueEnd={props.filterValueEnd}
          totalRows={props.totalRows}
          filterValueInputRef={props.filterValueInputRef}
          onChangeFilterColumn={props.onChangeFilterColumn}
          onChangeFilterMode={props.onChangeFilterMode}
          onChangeFilterValue={props.onChangeFilterValue}
          onChangeFilterValueEnd={props.onChangeFilterValueEnd}
          onClearFilters={props.onClearFilters}
        />
      </div>

      <div className={styles.toolbarGroup}>
        <span className={styles.toolbarGroupLabel}>Rows</span>
        <select
          className={styles.toolbarPageSize}
          value={String(props.pageSize)}
          onChange={(e) => props.onChangePageSize(Number(e.target.value) || 50)}
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
          <button className="btn small" onClick={props.onImport} disabled={columns.length === 0}>
            Import
          </button>
          <button className="btn small primary" onClick={props.onAddRow} disabled={columns.length === 0}>
            Add row
          </button>
        </div>
      ) : null}
    </div>
  )
}
