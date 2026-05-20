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

    render(
      <CellContentPanel
        columnName="payload"
        dataType="jsonb"
        value={{ ok: true }}
        onClose={onClose}
      />
    )

    expect(screen.getByText(/"ok": true/)).toBeInTheDocument()
    expect(screen.getByRole('separator', { name: 'Resize cell viewer' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('{\n  "ok": true\n}'))

    fireEvent.click(screen.getByRole('button', { name: 'Close cell viewer' }))
    expect(onClose).toHaveBeenCalled()
  })
})
