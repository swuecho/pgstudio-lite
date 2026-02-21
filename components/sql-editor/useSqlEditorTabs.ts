import { useMemo } from 'react'
import { QueryTab, SnippetItem } from './types'
import { useSqlEditorTabsStore } from './stores/sqlEditorTabsStore'

export function useSqlEditorTabs() {
  const queryTabs = useSqlEditorTabsStore((s) => s.queryTabs)
  const setQueryTabs = useSqlEditorTabsStore((s) => s.setQueryTabs)
  const activeQueryTabId = useSqlEditorTabsStore((s) => s.activeQueryTabId)
  const setActiveQueryTabId = useSqlEditorTabsStore((s) => s.setActiveQueryTabId)

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
              snippetConnectionName:
                snippetId === undefined ? tab.snippetConnectionName : snippetId ? tab.snippetConnectionName : undefined,
            }
          : tab
      )
    )
  }

  function createQueryTab(
    initialQuery = '-- New query\n',
    options: { title?: string; snippetId?: string; snippetConnectionName?: string; dirty?: boolean } = {}
  ) {
    const nextIndex = queryTabs.length + 1
    const id = `tab-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    const tab: QueryTab = {
      id,
      title: options.title || `Query ${nextIndex}`,
      query: initialQuery,
      dirty: options.dirty ?? false,
      snippetId: options.snippetId,
      snippetConnectionName: options.snippetConnectionName,
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

  function openSnippetInTab(item: SnippetItem, connectionName: string) {
    const existing = queryTabs.find(
      (tab) => tab.snippetId === item.id && tab.snippetConnectionName === connectionName
    )
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
                snippetConnectionName: connectionName,
              }
            : tab
        )
      )
      setActiveQueryTabId(existing.id)
      return
    }

    createQueryTab(item.query_text, {
      title: item.title,
      snippetId: item.id,
      snippetConnectionName: connectionName,
      dirty: false,
    })
  }

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
