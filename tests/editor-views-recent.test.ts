import { beforeAll, describe, expect, it } from 'vitest'
import { MAX_RECENT_VIEWS } from '@/lib/table-editor-views'

process.env.PG_CONNECTIONS_JSON = ''
process.env.PG_CONNECTION_STRING = 'postgres://user:pass@localhost:5432/recent_views_test'
process.env.PG_CONNECTION_NAME = 'recent-views-test'

const CONNECTION_NAME = 'recent-views-test'

type EditorViews = typeof import('@/lib/db/editor-views')
let editorViews: EditorViews

beforeAll(async () => {
  editorViews = await import('@/lib/db/editor-views')
  editorViews.clearTableEditorRecentViews(CONNECTION_NAME)
})

describe('recordTableEditorRecentView', () => {
  it('records a visit without throwing', () => {
    // Regression: this path used .offset() with no .limit(), which SQLite
    // rejects with `near "offset": syntax error` — so every table open 500'd.
    expect(() =>
      editorViews.recordTableEditorRecentView({
        connectionName: CONNECTION_NAME,
        activeTable: 'public.users',
      })
    ).not.toThrow()

    const { recentViews } = editorViews.getTableEditorViews(CONNECTION_NAME)
    expect(recentViews.map((view) => view.activeTable)).toContain('public.users')
  })

  it('prunes older visits beyond the recent-view cap', () => {
    const total = MAX_RECENT_VIEWS + 5
    for (let index = 0; index < total; index += 1) {
      editorViews.recordTableEditorRecentView({
        connectionName: CONNECTION_NAME,
        activeTable: `public.table_${String(index).padStart(3, '0')}`,
      })
    }

    const { recentViews } = editorViews.getTableEditorViews(CONNECTION_NAME)
    expect(recentViews.length).toBeLessThanOrEqual(MAX_RECENT_VIEWS)
    // The most recent visit survives pruning.
    expect(recentViews[0].activeTable).toBe(`public.table_${String(total - 1).padStart(3, '0')}`)
  })
})
