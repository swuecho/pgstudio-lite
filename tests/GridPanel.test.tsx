// @vitest-environment jsdom
import { createRef } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TableGridPanel } from '../components/table-editor/GridPanel'
import type { ColumnInfo, RowData } from '../components/table-editor/types'

function makeProps(overrides: Partial<React.ComponentProps<typeof TableGridPanel>> = {}) {
  const columns: ColumnInfo[] = [
    { name: 'id', dataType: 'integer', isNullable: false, isIdentity: true, isPrimaryKey: true },
    { name: 'name', dataType: 'text', isNullable: false, isIdentity: false, isPrimaryKey: false },
  ]
  const rows: RowData[] = [
    { _rowKey: { id: 1 }, id: 1, name: 'alice' },
    { _rowKey: { id: 2 }, id: 2, name: 'bob' },
  ]
  return {
    columns,
    rows,
    editableColumns: [columns[1]],
    sortBy: '',
    sortOrder: 'asc' as const,
    filterColumn: '',
    filterMode: 'contains' as const,
    filterValue: '',
    filterValueInputRef: createRef<HTMLInputElement>(),
    pageSize: 50,
    page: 0,
    totalRows: 2,
    readOnlyTable: false,
    visibleColumns: ['id', 'name'],
    onChangeSortBy: vi.fn(),
    onChangeSortOrder: vi.fn(),
    onChangeFilterColumn: vi.fn(),
    onChangeFilterMode: vi.fn(),
    onChangeFilterValue: vi.fn(),
    onClearFilters: vi.fn(),
    onChangePageSize: vi.fn(),
    onUpdateCell: vi.fn(),
    onDeleteRow: vi.fn(),
    onInsertRow: vi.fn().mockResolvedValue(true),
    onPrevPage: vi.fn(),
    onNextPage: vi.fn(),
    onToggleVisibleColumn: vi.fn(),
    onShowAllColumns: vi.fn(),
    onHideAllColumns: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

describe('TableGridPanel', () => {
  it('renders columns and rows', () => {
    render(<TableGridPanel {...makeProps()} />)
    // editable column renders as input with defaultValue
    expect(screen.getByDisplayValue('alice')).toBeInTheDocument()
    expect(screen.getByDisplayValue('bob')).toBeInTheDocument()
    // both id and name appear as column headers
    expect(screen.getAllByText('id').length).toBeGreaterThan(0)
    expect(screen.getAllByText('name').length).toBeGreaterThan(0)
  })

  it('renders read-only identity columns as click-to-copy cells', () => {
    render(<TableGridPanel {...makeProps()} />)
    // id column is identity (read-only) -> uses CopyableCellValue
    const idCells = screen.getAllByRole('button').filter((el) => el.classList.contains('copyable-cell'))
    expect(idCells.length).toBe(2)
    expect(idCells[0]).toHaveTextContent('1')
    expect(idCells[1]).toHaveTextContent('2')
  })

  it('renders editable columns as inputs, not copyable cells', () => {
    render(<TableGridPanel {...makeProps()} />)
    const inputs = screen.getAllByDisplayValue(/alice|bob/)
    expect(inputs).toHaveLength(2)
    expect(inputs[0].tagName).toBe('INPUT')
  })

  it('shows total rows and current page in pagination summary', () => {
    render(<TableGridPanel {...makeProps({ totalRows: 137, page: 2, pageSize: 50 })} />)
    expect(screen.getByText(/137 rows total/)).toHaveTextContent('page 3 / 3')
  })

  it('disables Prev on first page, enables Next when more rows remain', () => {
    render(<TableGridPanel {...makeProps({ totalRows: 200, page: 0, pageSize: 50 })} />)
    expect(screen.getByRole('button', { name: /^prev$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^next$/i })).not.toBeDisabled()
  })

  it('disables Next on last page', () => {
    render(<TableGridPanel {...makeProps({ totalRows: 100, page: 1, pageSize: 50 })} />)
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^prev$/i })).not.toBeDisabled()
  })

  it('fires pagination callbacks', () => {
    const onNextPage = vi.fn()
    const onPrevPage = vi.fn()
    render(
      <TableGridPanel {...makeProps({ totalRows: 200, page: 1, pageSize: 50, onNextPage, onPrevPage })} />
    )
    fireEvent.click(screen.getByRole('button', { name: /^prev$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
    expect(onPrevPage).toHaveBeenCalledTimes(1)
    expect(onNextPage).toHaveBeenCalledTimes(1)
  })

  it('exposes page-size options including 250 and 500', () => {
    render(<TableGridPanel {...makeProps()} />)
    const select = screen.getByDisplayValue('50') as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toEqual(['25', '50', '100', '250', '500'])
  })

  it('renders all cells as read-only when readOnlyTable is true', () => {
    render(<TableGridPanel {...makeProps({ readOnlyTable: true })} />)
    expect(screen.queryAllByDisplayValue(/alice|bob/)).toHaveLength(0)
    const copyables = screen.getAllByRole('button').filter((el) => el.classList.contains('copyable-cell'))
    // 2 rows × 2 columns = 4 copyable cells
    expect(copyables).toHaveLength(4)
  })

  it('triggers delete confirmation dialog when Delete row is clicked', () => {
    render(<TableGridPanel {...makeProps()} />)
    const deleteButtons = screen.getAllByRole('button', { name: /^delete$/i })
    expect(deleteButtons.length).toBeGreaterThan(0)
    fireEvent.click(deleteButtons[0])
    // dialog shows confirm + cancel
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument()
  })

  it('calls onDeleteRow with the row key when confirmed', () => {
    const onDeleteRow = vi.fn()
    render(<TableGridPanel {...makeProps({ onDeleteRow })} />)
    const deleteButtons = screen.getAllByRole('button', { name: /^delete$/i })
    fireEvent.click(deleteButtons[0])
    // dialog confirm button label is "Delete row"
    fireEvent.click(screen.getByRole('button', { name: /delete row/i }))
    expect(onDeleteRow).toHaveBeenCalledWith({ id: 1 })
  })
})
