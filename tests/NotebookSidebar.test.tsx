// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NotebookSidebar } from '../components/notebook/NotebookSidebar'
import type { Notebook } from '../components/notebook/types'

function makeNotebook(id: string, title: string): Notebook {
  return {
    id,
    title,
    description: '',
    metadata_json: {},
    connection_name: 'localdev',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

function renderSidebar(overrides: Partial<React.ComponentProps<typeof NotebookSidebar>> = {}) {
  const props = {
    activeNotebookId: 'a',
    handleWidthResizerMouseDown: vi.fn(),
    notebookSearch: '',
    notebooks: [makeNotebook('a', 'Alpha'), makeNotebook('b', 'Beta')],
    onChangeNotebookSearch: vi.fn(),
    onCreateNotebook: vi.fn(),
    onDeleteNotebook: vi.fn(),
    onRenameNotebook: vi.fn(),
    onSelectNotebook: vi.fn(),
    ...overrides,
  }
  const utils = render(<NotebookSidebar {...props} />)
  return { ...utils, props }
}

describe('NotebookSidebar', () => {
  it('never nests a button inside another button', () => {
    const { container } = renderSidebar()
    expect(container.querySelector('button button')).toBeNull()
  })

  it('selects a notebook from its title and marks the active one', () => {
    const { props } = renderSidebar()
    fireEvent.click(screen.getByText('Beta'))
    expect(props.onSelectNotebook).toHaveBeenCalledWith('b')

    const alpha = screen.getByText('Alpha').closest('button')
    const beta = screen.getByText('Beta').closest('button')
    expect(alpha).toHaveAttribute('aria-pressed', 'true')
    expect(beta).toHaveAttribute('aria-pressed', 'false')
  })

  it('routes Rename and Delete to their handlers without also selecting the notebook', () => {
    const { props } = renderSidebar()
    const [renameAlpha] = screen.getAllByRole('button', { name: 'Rename' })
    const [, deleteBeta] = screen.getAllByRole('button', { name: 'Delete' })
    fireEvent.click(renameAlpha)
    fireEvent.click(deleteBeta)
    expect(props.onRenameNotebook).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
    expect(props.onDeleteNotebook).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))
    expect(props.onSelectNotebook).not.toHaveBeenCalled()
  })

  it('filters by title or connection name', () => {
    renderSidebar({ notebookSearch: 'bet' })
    expect(screen.queryByText('Alpha')).toBeNull()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })
})
