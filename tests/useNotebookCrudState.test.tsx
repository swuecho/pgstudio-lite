// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Notebook } from '../components/notebook/types'

vi.mock('../components/shared/hooks/useConnections', () => ({
  CONNECTIONS_QUERY_KEY: ['connections'],
  useConnections: () => ({ connections: [{ name: 'localdev' }], defaultConnectionName: 'localdev' }),
}))

vi.mock('@/features/notebook/notebook.service', () => ({
  getNotebooks: vi.fn(),
  getNotebook: vi.fn(),
  createNotebook: vi.fn(),
  updateNotebook: vi.fn(),
  deleteNotebook: vi.fn(),
}))

import * as service from '@/features/notebook/notebook.service'
import { useNotebookCrudState } from '../components/notebook/useNotebookCrudState'

const getNotebooks = vi.mocked(service.getNotebooks)
const getNotebook = vi.mocked(service.getNotebook)
const createNotebook = vi.mocked(service.createNotebook)
const deleteNotebook = vi.mocked(service.deleteNotebook)

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

const alpha = makeNotebook('a', 'Alpha')
const beta = makeNotebook('b', 'Beta')
const created = makeNotebook('c', 'Notebook 3')

function renderCrud() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const setStatus = vi.fn()
  const hook = renderHook(() => useNotebookCrudState({ setStatus }), { wrapper })
  return { ...hook, setStatus }
}

describe('useNotebookCrudState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getNotebook.mockImplementation(async (id: string) => ({
      notebook: [alpha, beta, created].find((n) => n.id === id)!,
      cells: [],
    }))
  })

  it('activates the first notebook once the list loads', async () => {
    getNotebooks.mockResolvedValue({ items: [alpha, beta] })
    const { result } = renderCrud()
    await waitFor(() => expect(result.current.activeNotebookId).toBe('a'))
  })

  it('keeps a newly created notebook active while the list refetches', async () => {
    // Initial list lacks the notebook we are about to create. The refetch after
    // creation is held open so the hook has to live with the stale cached list
    // for a while, as it does against a real server.
    let resolveRefetch: (value: { items: Notebook[] }) => void = () => {}
    getNotebooks.mockResolvedValueOnce({ items: [alpha, beta] })
    getNotebooks.mockImplementationOnce(
      () =>
        new Promise<{ items: Notebook[] }>((resolve) => {
          resolveRefetch = resolve
        })
    )
    getNotebooks.mockResolvedValue({ items: [created, alpha, beta] })
    createNotebook.mockResolvedValue({ item: created })

    const { result, setStatus } = renderCrud()
    await waitFor(() => expect(result.current.activeNotebookId).toBe('a'))

    act(() => result.current.createNotebookMutation.mutate())
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith('Notebook created'))
    await waitFor(() => expect(getNotebooks).toHaveBeenCalledTimes(2))

    // Refetch still pending: the new notebook must already be listed and active.
    expect(result.current.notebooks.map((n) => n.id)).toEqual(['c', 'a', 'b'])
    expect(result.current.activeNotebookId).toBe('c')

    await act(async () => {
      resolveRefetch({ items: [created, alpha, beta] })
    })
    await waitFor(() => expect(result.current.notebooks.map((n) => n.id)).toEqual(['c', 'a', 'b']))
    expect(result.current.activeNotebookId).toBe('c')
  })

  it('falls back to the first notebook when the active one disappears from a settled list', async () => {
    getNotebooks.mockResolvedValueOnce({ items: [alpha, beta] })
    getNotebooks.mockResolvedValue({ items: [beta] })
    deleteNotebook.mockResolvedValue({ ok: true })

    const { result } = renderCrud()
    await waitFor(() => expect(result.current.activeNotebookId).toBe('a'))

    act(() => result.current.removeNotebook('a'))

    await waitFor(() => expect(result.current.notebooks.map((n) => n.id)).toEqual(['b']))
    await waitFor(() => expect(result.current.activeNotebookId).toBe('b'))
  })
})
