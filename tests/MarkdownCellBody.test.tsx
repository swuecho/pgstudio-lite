// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MarkdownCellBody } from '../components/notebook/MarkdownCellBody'
import type { NotebookCell } from '../components/notebook/types'

const cell: NotebookCell = {
  id: 'md',
  notebook_id: 'nb',
  position: 0,
  type: 'markdown',
  content: '# Hello',
  collapsed: false,
  last_run_status: null,
  last_run_at: null,
  last_duration_ms: null,
  last_row_count: null,
  last_result_json: null,
  last_error: null,
  metadata_json: null,
  updated_at: '2026-01-01T00:00:00.000Z',
}

describe('MarkdownCellBody', () => {
  it('renders the preview on Cmd/Ctrl+Enter from the textarea', () => {
    const onTogglePreview = vi.fn()
    render(
      <MarkdownCellBody
        cell={cell}
        draft="# Hello"
        previewMarkdown={false}
        onTogglePreview={onTogglePreview}
        onChange={() => {}}
      />
    )

    const textarea = screen.getByLabelText('Markdown source')
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onTogglePreview).not.toHaveBeenCalled()

    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    expect(onTogglePreview).toHaveBeenCalledTimes(2)
  })

  it('goes back to editing when the preview is double-clicked, but not while collapsed', () => {
    const onTogglePreview = vi.fn()
    const { rerender } = render(
      <MarkdownCellBody
        cell={cell}
        draft="# Hello"
        previewMarkdown
        onTogglePreview={onTogglePreview}
        onChange={() => {}}
      />
    )

    fireEvent.doubleClick(screen.getByRole('heading', { name: 'Hello' }))
    expect(onTogglePreview).toHaveBeenCalledTimes(1)

    rerender(
      <MarkdownCellBody
        cell={{ ...cell, collapsed: true }}
        draft="# Hello"
        previewMarkdown={false}
        onTogglePreview={onTogglePreview}
        onChange={() => {}}
      />
    )
    fireEvent.doubleClick(screen.getByRole('heading', { name: 'Hello' }))
    expect(onTogglePreview).toHaveBeenCalledTimes(1)
  })
})
