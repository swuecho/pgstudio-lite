import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createDebouncedStateStorage } from '../../../lib/debouncedStorage'
import type { QueryTab } from '../types'

const debouncedTabsStorage = createDebouncedStateStorage(500)

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => debouncedTabsStorage.flush())
}

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
      storage: createJSONStorage(() => debouncedTabsStorage),
      partialize: (state) => ({
        queryTabs: state.queryTabs,
        activeQueryTabId: state.activeQueryTabId,
      }),
    }
  )
)
