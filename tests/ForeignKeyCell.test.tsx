// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ForeignKeyCell } from '../components/table-editor/ForeignKeyCell'
import type { ColumnInfo } from '../components/table-editor/types'

const fetchReferencedRow = vi.fn()

vi.mock('../components/table-editor/useForeignKeyLookup', () => ({
  useForeignKeyLookup: () => ({ fetchReferencedRow }),
}))

const userColumn: ColumnInfo = {
  name: 'user_id',
  dataType: 'integer',
  isNullable: false,
  isIdentity: false,
  isPrimaryKey: false,
  foreignKey: {
    constraintName: 'orders_user_id_fkey',
    referencedSchema: 'public',
    referencedTable: 'users',
    referencedColumn: 'id',
    constraintColumns: ['user_id'],
    constraintReferencedColumns: ['id'],
  },
}

function renderCell(value: unknown = 42) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ForeignKeyCell connectionName="local" column={userColumn} row={{ user_id: value }}>
        <span>cell-{String(value)}</span>
      </ForeignKeyCell>
    </QueryClientProvider>
  )
}

describe('ForeignKeyCell', () => {
  beforeEach(() => {
    fetchReferencedRow.mockReset()
    fetchReferencedRow.mockResolvedValue({
      row: { id: 42, name: 'alice' },
      columns: [
        { name: 'id', dataType: 'integer', isNullable: false, isIdentity: false, isPrimaryKey: true },
        { name: 'name', dataType: 'text', isNullable: false, isIdentity: false, isPrimaryKey: false },
      ],
    })
  })

  it('renders children without FK affordance when value is null', () => {
    renderCell(null)
    expect(screen.getByText('cell-null')).toBeInTheDocument()
    expect(screen.queryByText('↗')).not.toBeInTheDocument()
  })

  it('fetches referenced row after hover delay', async () => {
    renderCell(42)
    fireEvent.mouseEnter(screen.getByText('cell-42').parentElement!)

    await waitFor(
      () => {
        expect(fetchReferencedRow).toHaveBeenCalledWith({
          connectionName: 'local',
          schema: 'public',
          table: 'users',
          match: { id: 42 },
        })
      },
      { timeout: 800 }
    )

    expect(await screen.findByText('users')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
  })
})
