// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { NotebookCell } from '../components/notebook/types'

vi.mock('@/features/notebook/notebook.service', () => ({
  updateCell: vi.fn(),
}))

import * as service from '@/features/notebook/notebook.service'
import { useCellAutoSave } from '../components/notebook/useCellAutoSave'

const updateCell = vi.mocked(service.updateCell)

const cell: NotebookCell = {
  id: 'c1',
  notebook_id: 'nb',
  position: 0,
  type: 'sql',
  content: 'select 1',
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

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function renderAutoSave() {
  const setStatus = vi.fn()
  const rendered = renderHook(() => useCellAutoSave({ activeNotebookId: 'nb', setStatus }), { wrapper })
  return { ...rendered, setStatus }
}

describe('useCellAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    updateCell.mockReset()
    updateCell.mockResolvedValue({ item: cell, cells: [cell] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces a save and sends the merged payload', () => {
    const { result } = renderAutoSave()

    act(() => {
      result.current.scheduleCellSave(cell, { content: 'select 1' })
      result.current.scheduleCellSave(cell, { content: 'select 2' })
    })
    expect(updateCell).not.toHaveBeenCalled()
    expect(result.current.pendingSaveByCell).toEqual({ c1: true })

    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(updateCell).toHaveBeenCalledTimes(1)
    expect(updateCell).toHaveBeenCalledWith('nb', { cellId: 'c1', content: 'select 2' }, {})
  })

  it('flushes edits still inside the debounce window when the hook unmounts', () => {
    const { result, unmount } = renderAutoSave()

    act(() => {
      result.current.scheduleCellSave(cell, { content: 'unsaved edit' })
    })
    expect(updateCell).not.toHaveBeenCalled()

    unmount()

    expect(updateCell).toHaveBeenCalledTimes(1)
    expect(updateCell).toHaveBeenCalledWith('nb', { cellId: 'c1', content: 'unsaved edit' }, {})

    // The timer was consumed by the flush; nothing fires twice.
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(updateCell).toHaveBeenCalledTimes(1)
  })

  it('flushes with keepalive when the document is about to unload', async () => {
    vi.useRealTimers()
    const { result } = renderAutoSave()

    act(() => {
      result.current.scheduleCellSave(cell, { content: 'closing tab' })
    })
    act(() => {
      window.dispatchEvent(new Event('beforeunload'))
    })

    expect(updateCell).toHaveBeenCalledTimes(1)
    expect(updateCell).toHaveBeenCalledWith(
      'nb',
      { cellId: 'c1', content: 'closing tab' },
      { keepalive: true }
    )
    // If the page survives (unload cancelled elsewhere), the pending marker clears.
    await waitFor(() => expect(result.current.pendingSaveByCell).toEqual({}))
  })

  it('saves to the notebook that was active when the edit was scheduled', () => {
    const { result, unmount } = renderAutoSave()

    act(() => {
      result.current.scheduleCellSave(cell, { content: 'other' }, 'nb-other')
    })
    unmount()

    expect(updateCell).toHaveBeenCalledWith('nb-other', { cellId: 'c1', content: 'other' }, {})
  })

  it('does nothing on unmount when nothing is pending', () => {
    const { unmount } = renderAutoSave()
    unmount()
    expect(updateCell).not.toHaveBeenCalled()
  })
})
