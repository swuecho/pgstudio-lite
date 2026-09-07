// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SqlEditorPage from '@/pages/index'
import { useSqlEditorTabsStore } from '@/components/sql-editor/stores/sqlEditorTabsStore'
import type { QueryResult } from '@/components/sql-editor/types'

/**
 * Editing SQL updates the tabs store on a debounce, which re-renders the page.
 * The sidebar and the results table are memoized so that render stays cheap;
 * these counters fail the test if someone reintroduces inline props that defeat
 * the memoization.
 */
const renders = vi.hoisted(() => ({ sidebar: 0, results: 0 }))

vi.mock('@/components/sql-editor/Sidebar', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/components/sql-editor/Sidebar')>()
  const React = await import('react')
  const Counting = React.memo(function CountingSidebar(props: React.ComponentProps<typeof mod.SqlSidebar>) {
    renders.sidebar += 1
    return React.createElement(mod.SqlSidebar, props)
  })
  return { ...mod, SqlSidebar: Counting }
})

vi.mock('@/components/sql-editor/ResultsPanel', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/components/sql-editor/ResultsPanel')>()
  const React = await import('react')
  const Counting = React.memo(function CountingResults(
    props: React.ComponentProps<typeof mod.SqlResultsPanel>
  ) {
    renders.results += 1
    return React.createElement(mod.SqlResultsPanel, props)
  })
  return { ...mod, SqlResultsPanel: Counting }
})

vi.mock('@/components/sql-editor/EditorPane', async () => {
  const React = await import('react')
  return {
    EditorPane: (props: { value: string; onChangeValue: (value: string) => void }) =>
      React.createElement(
        'button',
        { type: 'button', onClick: () => props.onChangeValue(`${props.value} -- edited`) },
        'simulate edit'
      ),
  }
})

vi.mock('next/router', () => ({
  useRouter: () => ({ isReady: true, query: {}, pathname: '/', replace: vi.fn() }),
}))
vi.mock('@/components/shared/PageHead', () => ({ PageHead: () => null }))
vi.mock('@/components/shared/NavRail', () => ({ NavRail: () => null }))
vi.mock('@/components/settings/SettingsPanel', () => ({ SettingsPanel: () => null }))
vi.mock('@/components/settings/SettingsButton', () => ({ SettingsButton: () => null }))
vi.mock('@/components/shared/hooks/useActiveConnection', () => ({
  useActiveConnection: () => ({ connections: [{ name: 'dev' }], connectionName: 'dev' }),
}))

const explorer = vi.hoisted(() => {
  const schemaGroups = [['public', [{ schema: 'public', table: 'users', estimatedRows: 1, kind: 'table' }]]]
  const empty = {}
  return {
    schemaGroups,
    expandedSchemas: empty,
    expandedTables: empty,
    loadingColumnsByKey: empty,
    tableColumnsByKey: empty,
    schemaTablesRef: { current: [] },
    tableColumnsByKeyRef: { current: {} },
    toggleSchema: () => {},
    toggleTable: () => {},
    loadSchema: async () => {},
    ensureColumnsForTable: async () => [],
    loadingSchema: false,
  }
})
vi.mock('@/components/sql-editor/useSqlEditorExplorer', () => ({ useSqlEditorExplorer: () => explorer }))

const history = vi.hoisted(() => ({
  filteredHistory: [] as unknown[],
  loadHistory: async () => {},
  clearHistory: async () => {},
  loadingHistory: false,
}))
vi.mock('@/components/sql-editor/useSqlEditorHistory', () => ({ useSqlEditorHistory: () => history }))

const snippets = vi.hoisted(() => ({
  snippetItems: [] as unknown[],
  savingSnippet: false,
  loadingSnippets: false,
  renamingSnippetId: null,
  renameDraft: '',
  setRenameDraft: () => {},
  beginRenameSnippet: () => {},
  cancelRenameSnippet: () => {},
  getSuggestedSnippetTitle: () => 'title',
  getDuplicateSnippetTitle: () => 'copy',
  duplicateSnippet: async () => {},
  renameSnippet: async () => {},
  deleteSnippet: async () => {},
  saveCurrentAsSnippet: async () => {},
  loadSnippets: async () => {},
}))
vi.mock('@/components/sql-editor/useSqlEditorSnippets', () => ({ useSqlEditorSnippets: () => snippets }))

const result: QueryResult = {
  connectionName: 'dev',
  statements: [
    {
      command: 'SELECT',
      rowCount: 2,
      returnedRowCount: 2,
      truncated: false,
      fields: ['id', 'name'],
      rows: [
        { id: 1, name: 'alice' },
        { id: 2, name: 'bob' },
      ],
    },
  ],
  totalRows: 2,
  durationMs: 3,
}

beforeEach(() => {
  renders.sidebar = 0
  renders.results = 0
  useSqlEditorTabsStore.setState({
    queryTabs: [{ id: 'one', title: 'One', query: 'select 1;', dirty: false, connectionName: 'dev' }],
    activeQueryTabId: 'one',
    resultsByTabId: { one: result },
  })
})

describe('SQL editor page rendering', () => {
  it('does not re-render the sidebar or results table when the query text changes', () => {
    render(<SqlEditorPage />)
    expect(screen.getByText('alice')).toBeInTheDocument()
    const before = { ...renders }
    expect(before.results).toBeGreaterThan(0)
    expect(before.sidebar).toBeGreaterThan(0)

    act(() => {
      fireEvent.click(screen.getByText('simulate edit'))
    })

    const tab = useSqlEditorTabsStore.getState().queryTabs[0]
    expect(tab).toMatchObject({ query: 'select 1; -- edited', dirty: true })
    expect(screen.getByRole('button', { name: /^One/ }).textContent).toContain('*')
    expect(renders).toEqual(before)
  })

  it('still re-renders them when their own inputs change', () => {
    render(<SqlEditorPage />)
    const before = { ...renders }

    act(() => {
      useSqlEditorTabsStore.getState().setTabResult('one', { ...result, totalRows: 5 })
    })
    expect(renders.results).toBe(before.results + 1)
    expect(screen.getByText('5 rows')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/^Search/), { target: { value: 'users' } })
    expect(renders.sidebar).toBe(before.sidebar + 1)
  })
})
