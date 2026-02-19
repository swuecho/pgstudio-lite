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
  onChangeSortBy: (value: string) => void
  onChangeSortOrder: (value: 'asc' | 'desc') => void
  onChangeFilterColumn: (value: string) => void
  onChangeFilterMode: (value: 'contains' | 'equals') => void
  onChangeFilterValue: (value: string) => void
  onChangePageSize: (value: number) => void
  onUpdateCell: (ctid: string, column: string, value: string) => void
  onDeleteRow: (ctid: string) => void
  onPrevPage: () => void
  onNextPage: () => void
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
  return (
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
                const readOnly = !editableColumns.some((c) => c.name === col.name)
                return (
                  <td key={col.name}>
                    {readOnly ? (
                      <code>{String(row[col.name] ?? '')}</code>
                    ) : (
                      <input
                        className="cell-input"
                        defaultValue={String(row[col.name] ?? '')}
                        onBlur={(e) => {
                          const newValue = e.target.value
                          if (String(row[col.name] ?? '') !== newValue) {
                            onUpdateCell(row._ctid, col.name, newValue)
                          }
                        }}
                      />
                    )}
                  </td>
                )
              })}
              <td>
                <button className="btn small danger" onClick={() => onDeleteRow(row._ctid)}>
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
  )
}
