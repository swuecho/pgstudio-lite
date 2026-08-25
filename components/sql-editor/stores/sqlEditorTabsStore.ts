import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createDebouncedStateStorage } from '../../../lib/debouncedStorage'
import type { QueryResult, QueryTab } from '../types'

const debouncedTabsStorage = createDebouncedStateStorage(500)

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => debouncedTabsStorage.flush())
}

type TabsUpdater = QueryTab[] | ((prev: QueryTab[]) => QueryTab[])

type SqlEditorTabsStore = {
  queryTabs: QueryTab[]
  activeQueryTabId: string
  resultsByTabId: Record<string, QueryResult | null>
  setQueryTabs: (updater: TabsUpdater) => void
  setActiveQueryTabId: (id: string) => void
  setTabResult: (tabId: string, result: QueryResult | null) => void
}

const DEFAULT_QUERY = '-- Write SQL and run with Ctrl/Cmd+Enter\nselect now() as server_time;'

export const useSqlEditorTabsStore = create<SqlEditorTabsStore>()(
  persist(
    (set) => ({
      queryTabs: [{ id: 'tab-1', title: 'Query 1', query: DEFAULT_QUERY, dirty: false }],
      activeQueryTabId: 'tab-1',
      resultsByTabId: {},
      setQueryTabs: (updater) =>
        set((state) => {
          const nextTabs = typeof updater === 'function' ? updater(state.queryTabs) : updater
          if (nextTabs === state.queryTabs) return state

          const openIds = new Set(nextTabs.map((tab) => tab.id))
          const staleIds = Object.keys(state.resultsByTabId).filter((id) => !openIds.has(id))
          if (staleIds.length === 0) return { queryTabs: nextTabs }

          const nextResults = { ...state.resultsByTabId }
          for (const id of staleIds) delete nextResults[id]
          return { queryTabs: nextTabs, resultsByTabId: nextResults }
        }),
      setActiveQueryTabId: (id) => set({ activeQueryTabId: id }),
      setTabResult: (tabId, result) =>
        set((state) => ({ resultsByTabId: { ...state.resultsByTabId, [tabId]: result } })),
    }),
    {
      name: 'pgstudio-sql-tabs',
      storage: createJSONStorage(() => debouncedTabsStorage),
      partialize: (state) => ({
        queryTabs: state.queryTabs,
        activeQueryTabId: state.activeQueryTabId,
        resultsByTabId: state.resultsByTabId,
      }),
    }
  )
)
