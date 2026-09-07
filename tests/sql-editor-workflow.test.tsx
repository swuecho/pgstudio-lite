// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useSqlEditorState } from '@/components/sql-editor/useSqlEditorState'
import { useSqlEditorTabsStore } from '@/components/sql-editor/stores/sqlEditorTabsStore'
import { runQuery } from '@/features/sql/sql.service'
import { HttpError } from '@/lib/http'

vi.mock('@/features/sql/sql.service', () => ({ runQuery: vi.fn() }))
vi.mock('@/components/shared/hooks/useActiveConnection', () => ({
  useActiveConnection: () => ({ connections: [{ name: 'dev' }, { name: 'staging' }], connectionName: 'dev' }),
}))
vi.mock('@/components/sql-editor/useSqlEditorExplorer', () => ({ useSqlEditorExplorer: () => ({}) }))
vi.mock('@/components/sql-editor/useSqlEditorHistory', () => ({
  useSqlEditorHistory: () => ({ loadHistory: vi.fn() }),
}))
vi.mock('@/components/sql-editor/useSqlEditorSnippets', () => ({
  useSqlEditorSnippets: () => ({ snippetItems: [] }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  useSqlEditorTabsStore.setState({
    queryTabs: [
      { id: 'one', title: 'One', query: 'select 1; select 2;', dirty: true, connectionName: 'dev' },
    ],
    activeQueryTabId: 'one',
    resultsByTabId: {},
  })
})

function editor(sql = 'select 1; select 2;') {
  return {
    getModel: () => ({ getValue: () => sql, getOffsetAt: () => 12 }),
    getPosition: () => ({ lineNumber: 1, column: 13 }),
    getSelection: () => ({ isEmpty: () => true }),
  } as any
}

it('runs only the current statement and leaves unsaved SQL dirty', async () => {
  vi.mocked(runQuery).mockResolvedValue({ statements: [], durationMs: 1, totalRows: 0 })
  const { result } = renderHook(() => useSqlEditorState())
  act(() => result.current.setEditorRef(editor()))
  await act(() => result.current.runCurrentQuery())
  expect(runQuery).toHaveBeenCalledWith('dev', ' select 2;', 100)
  expect(result.current.activeQueryTab?.dirty).toBe(true)
  expect(result.current.result?.connectionName).toBe('dev')
  await act(() => result.current.runCurrentQuery(true))
  expect(runQuery).toHaveBeenLastCalledWith('dev', 'select 1; select 2;', 100)
})

it('preserves results on failure and maps diagnostics into the editor', async () => {
  const previous = { statements: [], durationMs: 1, totalRows: 0, connectionName: 'dev' }
  useSqlEditorTabsStore.setState({ resultsByTabId: { one: previous } })
  vi.mocked(runQuery).mockRejectedValue(
    new HttpError('bad column', { status: 400, details: { position: 9, hint: 'Try id' } })
  )
  const { result } = renderHook(() => useSqlEditorState())
  act(() => result.current.setEditorRef(editor()))
  await act(() => result.current.runCurrentQuery())
  expect(result.current.result).toEqual(previous)
  expect(result.current.queryError).toMatchObject({ message: 'bad column', hint: 'Try id', offset: 17 })
  act(() => result.current.createQueryTab())
  expect(result.current.queryError).toBeUndefined()
  expect(result.current.status.text).toBe('Ready')
})

it('retains separate tab connections and display limits', () => {
  const { result } = renderHook(() => useSqlEditorState())
  act(() => result.current.createQueryTab())
  act(() => {
    result.current.setConnectionName('staging')
    result.current.setRowLimit(250)
  })
  expect(result.current.connectionName).toBe('staging')
  act(() => result.current.setActiveQueryTabId('one'))
  expect(result.current.connectionName).toBe('dev')
  expect(result.current.rowLimit).toBe(100)
})

it('never silently substitutes another database for an unavailable tab connection', async () => {
  useSqlEditorTabsStore.setState({
    queryTabs: [{ id: 'one', title: 'One', query: 'select 1', dirty: false, connectionName: 'deleted' }],
  })
  const { result } = renderHook(() => useSqlEditorState())
  act(() => result.current.setEditorRef(editor()))
  await act(() => result.current.runCurrentQuery())
  expect(result.current.connectionName).toBe('deleted')
  expect(runQuery).not.toHaveBeenCalled()
})

it('does not execute a stale draft immediately after clearing the editor', async () => {
  const { result } = renderHook(() => useSqlEditorState())
  act(() => result.current.setEditorRef(editor('')))
  await act(() => result.current.runCurrentQuery(true))
  expect(runQuery).not.toHaveBeenCalled()
})
