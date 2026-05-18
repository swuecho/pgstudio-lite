// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const mockService = vi.hoisted(() => ({
  listConnections: vi.fn(),
  createConnection: vi.fn(),
  updateConnection: vi.fn(),
  setDefaultConnection: vi.fn(),
  deleteConnection: vi.fn(),
}))

vi.mock('../features/connections/connections.service', () => mockService)

import { ConnectionsSection } from '../components/settings/sections/ConnectionsSection'
import { useActiveConnectionStore } from '../components/shared/stores/activeConnectionStore'

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    client,
    ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>),
  }
}

const sampleConnections = [
  { id: 'a', name: 'alpha', isDefault: true, readOnly: false },
  { id: 'b', name: 'beta', isDefault: false, readOnly: true },
]

describe('ConnectionsSection', () => {
  beforeEach(() => {
    useActiveConnectionStore.setState({ connectionName: 'alpha' })
    mockService.listConnections.mockResolvedValue({
      connections: sampleConnections,
      configured: true,
      defaultConnectionName: 'alpha',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('lists configured connections with default and read-only pills', async () => {
    renderWithClient(<ConnectionsSection />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())
    expect(screen.getByText('beta')).toBeInTheDocument()
    expect(screen.getByText('default')).toBeInTheDocument()
    expect(screen.getByText('read-only')).toBeInTheDocument()
  })

  it('creates a new connection and resets the form', async () => {
    mockService.createConnection.mockResolvedValue({
      item: { id: 'c', name: 'gamma', isDefault: false, readOnly: false },
    })
    renderWithClient(<ConnectionsSection />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())

    const nameInput = screen.getByPlaceholderText('Connection name')
    const stringInput = screen.getByPlaceholderText(/postgres:\/\//)
    fireEvent.change(nameInput, { target: { value: 'gamma' } })
    fireEvent.change(stringInput, { target: { value: 'postgres://g' } })

    fireEvent.click(screen.getByRole('button', { name: /add connection/i }))

    await waitFor(() => expect(mockService.createConnection).toHaveBeenCalledTimes(1))
    expect(mockService.createConnection.mock.calls[0][0]).toEqual({
      name: 'gamma',
      connectionString: 'postgres://g',
      isDefault: false,
      readOnly: false,
    })
    await waitFor(() => expect((nameInput as HTMLInputElement).value).toBe(''))
    expect((stringInput as HTMLInputElement).value).toBe('')
  })

  it('disables Add connection until both fields are filled', async () => {
    renderWithClient(<ConnectionsSection />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())
    const addBtn = screen.getByRole('button', { name: /add connection/i })
    expect(addBtn).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('Connection name'), { target: { value: 'x' } })
    expect(addBtn).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(/postgres:\/\//), { target: { value: 'postgres://x' } })
    expect(addBtn).not.toBeDisabled()
  })

  it('sets a non-default connection as default', async () => {
    mockService.setDefaultConnection.mockResolvedValue({
      item: { id: 'b', name: 'beta', isDefault: true, readOnly: true },
    })
    renderWithClient(<ConnectionsSection />)
    await waitFor(() => expect(screen.getByText('beta')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /set default/i }))
    await waitFor(() => expect(mockService.setDefaultConnection).toHaveBeenCalledTimes(1))
    expect(mockService.setDefaultConnection.mock.calls[0][0]).toBe('b')
    await waitFor(() => expect(useActiveConnectionStore.getState().connectionName).toBe('beta'))
  })

  it('disables Delete for the only remaining connection', async () => {
    mockService.listConnections.mockResolvedValue({
      connections: [sampleConnections[0]],
      configured: true,
      defaultConnectionName: 'alpha',
    })
    renderWithClient(<ConnectionsSection />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeDisabled()
  })

  it('shows the error message when create fails', async () => {
    mockService.createConnection.mockRejectedValue(new Error('duplicate name'))
    renderWithClient(<ConnectionsSection />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText('Connection name'), { target: { value: 'gamma' } })
    fireEvent.change(screen.getByPlaceholderText(/postgres:\/\//), { target: { value: 'postgres://g' } })
    fireEvent.click(screen.getByRole('button', { name: /add connection/i }))

    await waitFor(() => expect(screen.getByText('duplicate name')).toBeInTheDocument())
  })
})
