// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NavRail } from '@/components/shared/NavRail'

describe('NavRail', () => {
  it('names every destination for hover and assistive tech', () => {
    render(<NavRail active="table" />)

    // The rail shows two-letter labels; the accessible name has to say more.
    expect(screen.getByRole('link', { name: 'SQL Editor' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Table Editor' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Notebook' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Activity' })).toBeInTheDocument()
  })

  it('marks the current page instead of rendering an inert button', () => {
    render(<NavRail active="notebook" />)

    const current = screen.getByRole('link', { name: 'Notebook' })
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Activity' })).not.toHaveAttribute('aria-current')
  })

  it('marks nothing current on contextual pages such as row trace', () => {
    render(<NavRail />)

    for (const name of ['SQL Editor', 'Table Editor', 'Notebook', 'Activity']) {
      expect(screen.getByRole('link', { name })).not.toHaveAttribute('aria-current')
    }
  })
})
