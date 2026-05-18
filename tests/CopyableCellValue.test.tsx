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

  it('does not throw when clipboard API is unavailable', () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    })
    render(<CopyableCellValue text="x" />)
    expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow()
  })
})
