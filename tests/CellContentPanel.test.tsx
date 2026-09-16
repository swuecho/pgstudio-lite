// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CellContentPanel } from '../components/shared/CellContentPanel'

describe('CellContentPanel', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('renders formatted content and copies on demand', async () => {
    const onClose = vi.fn()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(<CellContentPanel columnName="payload" dataType="jsonb" value={{ ok: true }} onClose={onClose} />)

    expect(screen.getByText('ok')).toBeInTheDocument()
    expect(screen.getByText('true')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }))
    expect(screen.getByText(/"ok": true/)).toBeInTheDocument()
    expect(screen.getByRole('separator', { name: 'Resize cell viewer' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('{\n  "ok": true\n}'))

    fireEvent.click(screen.getByRole('button', { name: 'Close cell viewer' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders json as a collapsible tree and falls back to raw text', () => {
    const value = { user: { name: 'ada', tags: ['a', 'b'] }, active: false, score: 3, note: null }
    render(<CellContentPanel columnName="payload" dataType="jsonb" value={value} onClose={vi.fn()} />)

    // Nested containers start collapsed with a summary of their size.
    expect(screen.getByText('2 keys')).toBeInTheDocument()
    expect(screen.queryByText('name')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand user' }))
    expect(screen.getByText('name')).toBeInTheDocument()
    expect(screen.getByText('"ada"')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(screen.getByText('"b"')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }))
    expect(screen.queryByText('name')).not.toBeInTheDocument()
  })

  it('shows plain text without a tree toggle', () => {
    render(<CellContentPanel columnName="note" dataType="text" value="hello there" onClose={vi.fn()} />)

    expect(screen.getByText('hello there')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tree' })).not.toBeInTheDocument()
  })

  it('parses json held as a string', () => {
    render(<CellContentPanel columnName="payload" dataType="jsonb" value='{"a":1}' onClose={vi.fn()} />)

    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })
})
