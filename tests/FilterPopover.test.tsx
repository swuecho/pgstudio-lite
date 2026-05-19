// @vitest-environment jsdom
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FilterPopover } from '../components/table-editor/FilterPopover'
import type { ColumnInfo } from '../components/table-editor/types'

const columns: ColumnInfo[] = [
  { name: 'id', dataType: 'integer', isNullable: false, isIdentity: true, isPrimaryKey: true },
  { name: 'name', dataType: 'text', isNullable: false, isIdentity: false, isPrimaryKey: false },
]

function makeProps(overrides: Partial<React.ComponentProps<typeof FilterPopover>> = {}) {
  return {
    columns,
    filterColumn: '',
    filterMode: 'contains' as const,
    filterValue: '',
    filterValueInputRef: createRef<HTMLInputElement>(),
    onChangeFilterColumn: vi.fn(),
    onChangeFilterMode: vi.fn(),
    onChangeFilterValue: vi.fn(),
    onClearFilters: vi.fn(),
    ...overrides,
  }
}

describe('FilterPopover', () => {
  it('opens filter controls in a popover', () => {
    render(<FilterPopover {...makeProps()} />)

    expect(screen.queryByLabelText('Operator')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    expect(screen.getByLabelText('Operator')).toBeInTheDocument()
  })

  it('shows active filter summary on the trigger button', () => {
    render(
      <FilterPopover
        {...makeProps({
          filterColumn: 'name',
          filterMode: 'contains',
          filterValue: 'alice',
        })}
      />
    )

    expect(screen.getByRole('button', { name: /Filter: name contains alice/ })).toBeInTheDocument()
  })
})
