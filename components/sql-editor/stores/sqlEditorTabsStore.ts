import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { QueryTab } from '../types'

type TabsUpdater = QueryTab[] | ((prev: QueryTab[]) => QueryTab[])

type SqlEditorTabsStore = {
  queryTabs: QueryTab[]
  activeQueryTabId: string
  setQueryTabs: (updater: TabsUpdater) => void
  setActiveQueryTabId: (id: string) => void
}

const DEFAULT_QUERY = '-- Write SQL and run with Ctrl/Cmd+Enter\nselect now() as server_time;'

export const useSqlEditorTabsStore = create<SqlEditorTabsStore>()(
  persist(
    (set) => ({
      queryTabs: [{ id: 'tab-1', title: 'Query 1', query: DEFAULT_QUERY, dirty: false }],
      activeQueryTabId: 'tab-1',
      setQueryTabs: (updater) =>
        set((state) => ({
          queryTabs: typeof updater === 'function' ? updater(state.queryTabs) : updater,
        })),
      setActiveQueryTabId: (id) => set({ activeQueryTabId: id }),
    }),
    {
      name: 'pgstudio-sql-tabs',
      partialize: (state) => ({
        queryTabs: state.queryTabs,
        activeQueryTabId: state.activeQueryTabId,
      }),
    }
  )
)
