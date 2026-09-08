// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { NotebookCell, NotebookWidgetMetadata } from '../components/notebook/types'

vi.mock('@/features/notebook/notebook.service', () => ({
  createCell: vi.fn(),
  updateCell: vi.fn(),
  deleteCell: vi.fn(),
}))

import * as service from '@/features/notebook/notebook.service'
import { useCellMutations } from '../components/notebook/useCellMutations'

const createCell = vi.mocked(service.createCell)
const updateCell = vi.mocked(service.updateCell)
const deleteCell = vi.mocked(service.deleteCell)

function makeCell(id: string, position: number, type: NotebookCell['type'], content = ''): NotebookCell {
  return {
    id,
    notebook_id: 'nb',
    position,
    type,
    content,
    collapsed: false,
    last_run_status: null,
    last_run_at: null,
    last_duration_ms: null,
    last_row_count: null,
    last_result_json: null,
    last_error: null,
    metadata_json:
      type === 'widget' ? { widgetType: 'text', key: 'q', label: 'Query', value: 'saved' } : null,
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

const sqlCell = makeCell('sql', 0, 'sql', 'select 1;')
const mdCell = makeCell('md', 1, 'markdown', '# Title')
const widgetCell = makeCell('wgt', 2, 'widget')
const emptyCell = makeCell('empty', 3, 'sql', 'select 2;')
const cells = [sqlCell, mdCell, widgetCell, emptyCell]

function renderMutations(
  options: { drafts?: Record<string, string>; widgetDrafts?: Record<string, NotebookWidgetMetadata> } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const setStatus = vi.fn()
  const setSelectedCellId = vi.fn()
  const draftByCellRef = { current: options.drafts ?? {} }
  const widgetDraftByCellRef = { current: options.widgetDrafts ?? {} }
  const hook = renderHook(
    () =>
      useCellMutations({
        activeNotebookId: 'nb',
        setStatus,
        sortedCells: cells,
        selectedCellId: 'sql',
        setSelectedCellId,
        draftByCellRef,
        widgetDraftByCellRef,
      }),
    { wrapper }
  )
  return { ...hook, setStatus, setSelectedCellId }
}

describe('useCellMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createCell.mockResolvedValue({ item: makeCell('new', 1, 'sql'), cells: [] })
    updateCell.mockResolvedValue({ item: sqlCell, cells: [] })
    deleteCell.mockResolvedValue({ ok: true, cells: [] })
  })

  it('duplicates a text cell from its unsaved draft, directly below the source', async () => {
    const { result, setSelectedCellId } = renderMutations({ drafts: { sql: 'select 99;' } })

    act(() => result.current.duplicateCellById('sql'))

    await waitFor(() => expect(createCell).toHaveBeenCalledTimes(1))
    expect(createCell).toHaveBeenCalledWith('nb', { type: 'sql', content: 'select 99;', position: 1 })
    await waitFor(() => expect(setSelectedCellId).toHaveBeenCalledWith('new'))
  })

  it('duplicates a widget cell from its current widget draft', async () => {
    const draft: NotebookWidgetMetadata = { widgetType: 'text', key: 'q', label: 'Query', value: 'edited' }
    const { result } = renderMutations({ widgetDrafts: { wgt: draft } })

    act(() => result.current.duplicateCellById('wgt'))

    await waitFor(() => expect(createCell).toHaveBeenCalledTimes(1))
    expect(createCell).toHaveBeenCalledWith('nb', { type: 'widget', metadata: draft, position: 3 })
  })

  it('converts between SQL and Markdown, carrying the draft text along', async () => {
    const { result, setStatus } = renderMutations({ drafts: { sql: 'select 5;' } })

    act(() => result.current.convertCellType(sqlCell, 'markdown'))
    await waitFor(() => expect(updateCell).toHaveBeenCalledTimes(1))
    expect(updateCell).toHaveBeenCalledWith('nb', { cellId: 'sql', type: 'markdown', content: 'select 5;' })
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith('Converted to Markdown'))

    act(() => result.current.convertCellType(mdCell, 'sql'))
    await waitFor(() => expect(updateCell).toHaveBeenCalledTimes(2))
    expect(updateCell).toHaveBeenLastCalledWith('nb', { cellId: 'md', type: 'sql', content: '# Title' })
  })

  it('refuses to convert a widget or to the type the cell already has', () => {
    const { result } = renderMutations()

    act(() => result.current.convertCellType(widgetCell, 'sql'))
    act(() => result.current.convertCellType(sqlCell, 'sql'))

    expect(updateCell).not.toHaveBeenCalled()
  })

  it('deletes an empty text cell immediately', async () => {
    const { result } = renderMutations({ drafts: { empty: '   ' } })

    act(() => result.current.requestDeleteCell(emptyCell))

    await waitFor(() => expect(deleteCell).toHaveBeenCalledWith('nb', 'empty'))
    expect(result.current.cellPendingDelete).toBeNull()
  })

  it('asks before deleting a cell with content, then selects its neighbour', async () => {
    const { result, setSelectedCellId } = renderMutations()

    act(() => result.current.requestDeleteCell(mdCell))
    expect(deleteCell).not.toHaveBeenCalled()
    expect(result.current.cellPendingDelete?.id).toBe('md')

    act(() => result.current.cancelDeleteCell())
    expect(result.current.cellPendingDelete).toBeNull()
    expect(deleteCell).not.toHaveBeenCalled()

    act(() => result.current.requestDeleteCell(mdCell))
    act(() => result.current.confirmDeleteCell())

    await waitFor(() => expect(deleteCell).toHaveBeenCalledWith('nb', 'md'))
    expect(result.current.cellPendingDelete).toBeNull()
    // The cell below moves up into the deleted slot, so it becomes the selection.
    await waitFor(() => expect(setSelectedCellId).toHaveBeenCalledWith('wgt'))
  })

  it('always asks before deleting a widget cell', () => {
    const { result } = renderMutations()

    act(() => result.current.requestDeleteCell(widgetCell))

    expect(deleteCell).not.toHaveBeenCalled()
    expect(result.current.cellPendingDelete?.id).toBe('wgt')
  })
})
