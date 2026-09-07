// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CopyableCellValue } from '../components/shared/CopyableCellValue'

function installClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
}

describe('CopyableCellValue', () => {
  beforeEach(() => {
    installClipboard(() => Promise.resolve())
  })

  it('renders the supplied text', () => {
    render(<CopyableCellValue text="hello" />)
    expect(screen.getByRole('button')).toHaveTextContent('hello')
  })

  it('copies text to clipboard on click and flashes copied state', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    installClipboard(writeText)
    render(<CopyableCellValue text="42" />)

    const cell = screen.getByRole('button')
    expect(cell).not.toHaveClass('copyable-cell-copied')

    fireEvent.click(cell)

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('42'))
    await waitFor(() => expect(cell).toHaveClass('copyable-cell-copied'))
    expect(cell).toHaveAttribute('title', 'Copied!')

    await waitFor(() => expect(cell).not.toHaveClass('copyable-cell-copied'), { timeout: 2000 })
  })

  it('copies on Enter and Space key presses', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    installClipboard(writeText)
    render(<CopyableCellValue text="kbd" />)

    const cell = screen.getByRole('button')
    fireEvent.keyDown(cell, { key: 'Enter' })
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('kbd'))

    writeText.mockClear()
    fireEvent.keyDown(cell, { key: ' ' })
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('kbd'))
  })

  it('shows displayText but copies the full text value', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    installClipboard(writeText)
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    render(<CopyableCellValue text={uuid} displayText="550e8400" />)
    const cell = screen.getByRole('button')
    expect(cell).toHaveTextContent('550e8400')
    expect(cell).toHaveAttribute('title', 'Click to copy full UUID')

    fireEvent.click(cell)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(uuid))
  })

  it('truncates display text past maxDisplayLength but copies the full value', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    installClipboard(writeText)
    const long = 'x'.repeat(50)
    render(<CopyableCellValue text={long} maxDisplayLength={10} />)
    const cell = screen.getByRole('button')
    expect(cell).toHaveTextContent('xxxxxxxxxx…')
    expect(cell.textContent?.length).toBe(11)
    expect(cell).toHaveAttribute('title', expect.stringContaining('50 chars'))

    fireEvent.click(cell)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(long))
  })

  it('falls back to execCommand when the Clipboard API is denied', async () => {
    installClipboard(vi.fn().mockRejectedValue(new Error('Write permission denied.')))
    const execCommand = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })
    try {
      render(<CopyableCellValue text="denied" />)
      const cell = screen.getByRole('button')
      fireEvent.click(cell)
      await waitFor(() => expect(execCommand).toHaveBeenCalledWith('copy'))
      await waitFor(() => expect(cell).toHaveAttribute('title', 'Copied!'))
    } finally {
      // @ts-expect-error restore jsdom's absence of execCommand
      delete document.execCommand
    }
  })

  it('shows a failure hint when nothing can copy', async () => {
    installClipboard(vi.fn().mockRejectedValue(new Error('Write permission denied.')))
    render(<CopyableCellValue text="nope" />)
    const cell = screen.getByRole('button')
    fireEvent.click(cell)
    await waitFor(() => expect(cell).toHaveAttribute('title', 'Copy failed'))
  })

  it('does not throw when clipboard API is unavailable', () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    })
    render(<CopyableCellValue text="x" />)
    expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow()
  })
})
