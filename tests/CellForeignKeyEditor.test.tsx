// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CellForeignKeyEditor } from '../components/table-editor/CellForeignKeyEditor'
import type { ColumnInfo, RowData } from '../components/table-editor/types'
import { getForeignKeyOptions } from '../features/table/table.service'

vi.mock('../features/table/table.service', () => ({
  getForeignKeyOptions: vi.fn(),
}))

const userColumn: ColumnInfo = {
  name: 'user_id',
  dataType: 'uuid',
  isNullable: true,
  isIdentity: false,
  isPrimaryKey: false,
  foreignKey: {
    constraintName: 'accounts_user_id_fkey',
    referencedSchema: 'public',
    referencedTable: 'users',
    referencedColumn: 'id',
    constraintColumns: ['user_id'],
    constraintReferencedColumns: ['id'],
  },
}

const row: RowData = {
  _rowKey: { id: 1 },
  id: 1,
  user_id: null,
}

describe('CellForeignKeyEditor', () => {
  beforeEach(() => {
    vi.mocked(getForeignKeyOptions).mockReset()
    vi.mocked(getForeignKeyOptions).mockResolvedValue({
      options: [{ value: 'u-1', label: 'Adam King' }],
      truncated: false,
    })
  })

  it('opens a picker from a compact FK cell and commits selected values explicitly', async () => {
    const onCommit = vi.fn(() => 'pending' as const)
    render(
      <CellForeignKeyEditor
        connectionName="local"
        column={userColumn}
        row={row}
        onCommit={onCommit}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /null/i }))

    await waitFor(() => {
      expect(getForeignKeyOptions).toHaveBeenCalledWith({
        connectionName: 'local',
        schema: 'public',
        table: 'users',
        column: 'id',
        search: '',
        limit: 50,
        selectedValue: '',
      })
    })
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    const option = await screen.findByRole('option', { name: /Adam King/i })
    fireEvent.mouseDown(option)

    expect(onCommit).toHaveBeenCalledWith(row, 'user_id', 'u-1', 'uuid', expect.any(Function))
    expect(screen.getByRole('button', { name: /Adam King/i })).toBeInTheDocument()
    expect(screen.getByText('u-1')).toBeInTheDocument()
  })

  it('requests the current FK value so it can be pinned first', async () => {
    vi.mocked(getForeignKeyOptions).mockResolvedValue({
      options: [
        { value: 'u-2', label: 'Current User', selected: true },
        { value: 'u-1', label: 'Adam King' },
      ],
      truncated: false,
    })
    const onCommit = vi.fn(() => 'pending' as const)
    render(
      <CellForeignKeyEditor
        connectionName="local"
        column={userColumn}
        row={{ ...row, user_id: 'u-2' }}
        onCommit={onCommit}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'u-2' }))

    await waitFor(() => {
      expect(getForeignKeyOptions).toHaveBeenCalledWith(
        expect.objectContaining({ selectedValue: 'u-2' })
      )
    })
    expect(await screen.findByRole('option', { name: /Current User/i })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByText('Current value')).toBeInTheDocument()
  })

  it('resolves and displays the FK label before editing', async () => {
    vi.mocked(getForeignKeyOptions).mockResolvedValue({
      options: [{ value: 'u-3', label: 'Resolved User', selected: true }],
      truncated: false,
    })
    const onCommit = vi.fn(() => 'pending' as const)
    render(
      <CellForeignKeyEditor
        connectionName="local"
        column={userColumn}
        row={{ ...row, user_id: 'u-3' }}
        onCommit={onCommit}
      />
    )

    expect(await screen.findByRole('button', { name: /Resolved User/i })).toBeInTheDocument()
    expect(screen.getByText('u-3')).toBeInTheDocument()
    expect(getForeignKeyOptions).toHaveBeenCalledWith(
      expect.objectContaining({ selectedValue: 'u-3', limit: 1 })
    )
  })

  it('keeps only one FK cell editor open at a time', async () => {
    const onCommit = vi.fn(() => 'pending' as const)
    render(
      <>
        <CellForeignKeyEditor
          connectionName="local"
          column={userColumn}
          row={{ ...row, _rowKey: { id: 1 }, user_id: 'x-1' }}
          onCommit={onCommit}
        />
        <CellForeignKeyEditor
          connectionName="local"
          column={userColumn}
          row={{ ...row, _rowKey: { id: 2 }, user_id: 'x-2' }}
          onCommit={onCommit}
        />
      </>
    )

    fireEvent.mouseDown(screen.getByRole('button', { name: 'x-1' }))
    fireEvent.click(screen.getByRole('button', { name: 'x-1' }))
    expect(screen.getByRole('combobox')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'x-2' }))
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'x-1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'x-2' })).toHaveAttribute('aria-expanded', 'true')
  })
})
