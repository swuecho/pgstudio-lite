import { useEffect, useMemo, useState } from 'react'
import { QueryTab, SnippetItem } from './types'

const DEFAULT_QUERY = '-- Write SQL and run with Ctrl/Cmd+Enter\nselect now() as server_time;'
const TABS_STORAGE_KEY = 'pgstudio-query-tabs-v1'
const ACTIVE_TAB_STORAGE_KEY = 'pgstudio-active-tab-v1'

export function useSqlEditorTabs() {
  const [queryTabs, setQueryTabs] = useState<QueryTab[]>([
    { id: 'tab-1', title: 'Query 1', query: DEFAULT_QUERY, dirty: false },
  ])
  const [activeQueryTabId, setActiveQueryTabId] = useState('tab-1')

  const activeQueryTab = useMemo(
    () => queryTabs.find((tab) => tab.id === activeQueryTabId) || queryTabs[0],
    [activeQueryTabId, queryTabs]
  )

  function setActiveTabQuery(nextQuery: string, dirty = true, snippetId?: string | null) {
    setQueryTabs((tabs) =>
      tabs.map((tab) =>
        tab.id === activeQueryTabId
          ? {
              ...tab,
              query: nextQuery,
              dirty,
              snippetId: snippetId === undefined ? tab.snippetId : snippetId || undefined,
            }
          : tab
      )
    )
  }

  function createQueryTab(
    initialQuery = '-- New query\n',
    options: { title?: string; snippetId?: string; dirty?: boolean } = {}
  ) {
    const nextIndex = queryTabs.length + 1
    const id = `tab-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    const tab: QueryTab = {
      id,
      title: options.title || `Query ${nextIndex}`,
      query: initialQuery,
      dirty: options.dirty ?? false,
      snippetId: options.snippetId,
    }
    setQueryTabs((tabs) => [...tabs, tab])
    setActiveQueryTabId(id)
  }

  function closeTab(tabId: string) {
    if (queryTabs.length <= 1) return
    const currentIndex = queryTabs.findIndex((t) => t.id === tabId)
    const nextTabs = queryTabs.filter((t) => t.id !== tabId)
    setQueryTabs(nextTabs)
    if (activeQueryTabId === tabId) {
      const nextActive = nextTabs[Math.max(0, currentIndex - 1)] || nextTabs[0]
      if (nextActive) setActiveQueryTabId(nextActive.id)
    }
  }

  function renameTab(tabId: string) {
    const current = queryTabs.find((t) => t.id === tabId)
    if (!current) return
    const title = window.prompt('Tab name', current.title)?.trim()
    if (!title) return
    setQueryTabs((tabs) => tabs.map((tab) => (tab.id === tabId ? { ...tab, title } : tab)))
  }

  function openSnippetInTab(item: SnippetItem) {
    const existing = queryTabs.find((tab) => tab.snippetId === item.id)
    if (existing) {
      setQueryTabs((tabs) =>
        tabs.map((tab) =>
          tab.id === existing.id
            ? {
                ...tab,
                title: item.title,
                query: item.query_text,
                dirty: false,
                snippetId: item.id,
              }
            : tab
        )
      )
      setActiveQueryTabId(existing.id)
      return
    }

    createQueryTab(item.query_text, { title: item.title, snippetId: item.id, dirty: false })
  }

  useEffect(() => {
    const rawTabs = localStorage.getItem(TABS_STORAGE_KEY)
    const rawActiveId = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY)
    if (!rawTabs) return
    try {
      const parsed = JSON.parse(rawTabs) as QueryTab[]
      if (!Array.isArray(parsed) || parsed.length === 0) return
      const valid = parsed
        .filter((item) => item && typeof item.id === 'string' && typeof item.query === 'string')
        .map((item) => ({
          ...item,
          snippetId: typeof item.snippetId === 'string' ? item.snippetId : undefined,
        }))
      if (valid.length === 0) return
      setQueryTabs(valid)
      const hasActive = rawActiveId && valid.some((tab) => tab.id === rawActiveId)
      setActiveQueryTabId(hasActive ? (rawActiveId as string) : valid[0].id)
    } catch {
      // ignore invalid local cache
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(queryTabs))
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeQueryTabId)
  }, [queryTabs, activeQueryTabId])

  return {
    queryTabs,
    setQueryTabs,
    activeQueryTabId,
    setActiveQueryTabId,
    activeQueryTab,
    setActiveTabQuery,
    createQueryTab,
    closeTab,
    renameTab,
    openSnippetInTab,
  }
}
