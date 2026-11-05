// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('@/features/connections/connections.service', () => ({
  listConnections: vi.fn(async () => ({ connections: [], configured: false, defaultConnectionName: null })),
  createConnection: vi.fn(),
  updateConnection: vi.fn(),
  setDefaultConnection: vi.fn(),
  deleteConnection: vi.fn(),
}))
import { NavRail } from '@/components/shared/NavRail'
import { SettingsButton } from '@/components/settings/SettingsButton'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { useSettingsPanelStore } from '@/components/shared/stores/settingsPanelStore'

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

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

  describe('settings entry points', () => {
    beforeEach(() => {
      useSettingsPanelStore.setState({
        isOpen: false,
        activeSection: 'connections',
        lastAppSection: 'appearance',
      })
    })
    afterEach(() => {
      delete (window as Window & { pgstudioDesktop?: unknown }).pgstudioDesktop
    })

    it('opens app-wide settings, without the connections tab, from the rail gear', () => {
      renderWithClient(
        <>
          <NavRail active="sql" />
          <SettingsPanel />
        </>
      )

      fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

      expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
      const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent)
      expect(tabs).toEqual(['Appearance', 'Data'])
    })

    it('opens only connection management from the header button', () => {
      renderWithClient(
        <>
          <SettingsButton section="connections" label="Manage connections" />
          <SettingsPanel />
        </>
      )

      fireEvent.click(screen.getByRole('button', { name: 'Manage connections' }))

      expect(screen.getByRole('dialog', { name: 'Connections' })).toBeInTheDocument()
      expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    })

    it('returns to the last app tab after managing connections', () => {
      renderWithClient(<SettingsPanel />)
      act(() => useSettingsPanelStore.getState().openAppSettings())
      fireEvent.click(screen.getByRole('tab', { name: 'Data' }))
      act(() => useSettingsPanelStore.getState().open('connections'))
      act(() => useSettingsPanelStore.getState().openAppSettings())

      expect(screen.getByRole('tab', { name: 'Data' })).toHaveAttribute('aria-selected', 'true')
    })

    it('opens app settings when the desktop menu asks, and unsubscribes on unmount', () => {
      let listener: (() => void) | null = null
      ;(window as Window & { pgstudioDesktop?: unknown }).pgstudioDesktop = {
        version: null,
        openExternal: async () => {},
        onOpenSettings: (fn: () => void) => {
          listener = fn
          return () => {
            listener = null
          }
        },
      }

      const { unmount } = render(<NavRail active="sql" />)
      expect(listener).not.toBeNull()
      act(() => listener?.())
      expect(useSettingsPanelStore.getState()).toMatchObject({ isOpen: true, activeSection: 'appearance' })

      unmount()
      expect(listener).toBeNull()
    })
  })
})
