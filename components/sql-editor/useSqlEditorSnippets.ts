import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { fetchJson } from '../../lib/http'
import { QueryTab, SnippetItem } from './types'
import { useSqlEditorSnippetsStore } from './stores/sqlEditorSnippetsStore'

type StatusState = { text: string; tone: string }

type UseSqlEditorSnippetsParams = {
  activeQueryTab: QueryTab | undefined
  setQueryTabs: Dispatch<SetStateAction<QueryTab[]>>
  setStatus: Dispatch<SetStateAction<StatusState>>
  setActiveNavTab: Dispatch<SetStateAction<'history' | 'snippets' | 'explorer'>>
}

export function useSqlEditorSnippets({
  activeQueryTab,
  setQueryTabs,
  setStatus,
  setActiveNavTab,
}: UseSqlEditorSnippetsParams) {
  const snippetItems = useSqlEditorSnippetsStore((s) => s.snippetItems)
  const setSnippetItems = useSqlEditorSnippetsStore((s) => s.setSnippetItems)
  const savingSnippet = useSqlEditorSnippetsStore((s) => s.savingSnippet)
  const setSavingSnippet = useSqlEditorSnippetsStore((s) => s.setSavingSnippet)
  const renamingSnippetId = useSqlEditorSnippetsStore((s) => s.renamingSnippetId)
  const setRenamingSnippetId = useSqlEditorSnippetsStore((s) => s.setRenamingSnippetId)
  const renameDraft = useSqlEditorSnippetsStore((s) => s.renameDraft)
  const setRenameDraft = useSqlEditorSnippetsStore((s) => s.setRenameDraft)

  async function loadSnippets() {
    const data = await fetchJson<{ items: SnippetItem[] }>('/api/snippets?limit=300')
    setSnippetItems(data.items || [])
  }

  async function saveCurrentAsSnippet(forceCreate = false) {
    const content = (activeQueryTab?.query || '').trim()
    if (!content) {
      setStatus({ text: 'Query is empty', tone: 'warning' })
      return
    }

    try {
      setSavingSnippet(true)
      if (activeQueryTab?.snippetId && !forceCreate) {
        const payload = await fetchJson<{ item: SnippetItem }>('/api/snippets', {
          method: 'PATCH',
          body: JSON.stringify({
            id: activeQueryTab.snippetId,
            queryText: content,
          }),
        })
        setStatus({ text: `Updated snippet: ${payload.item.title}`, tone: 'ok' })
        setSnippetItems((items) => items.map((item) => (item.id === payload.item.id ? payload.item : item)))
        setQueryTabs((all) =>
          all.map((tab) =>
            tab.id === activeQueryTab?.id
              ? {
                  ...tab,
                  title: payload.item.title,
                  query: payload.item.query_text,
                  snippetId: payload.item.id,
                  dirty: false,
                }
              : tab
          )
        )
        return
      }

      const defaultTitle = content.split('\n')[0].replace(/^--\s*/, '').slice(0, 48) || 'New snippet'
      const title = window.prompt('Snippet name', defaultTitle)?.trim()
      if (!title) return
      const payload = await fetchJson<{ item: SnippetItem }>('/api/snippets', {
        method: 'POST',
        body: JSON.stringify({ title, queryText: content }),
      })
      setStatus({ text: `Saved snippet: ${payload.item.title}`, tone: 'ok' })
      setQueryTabs((all) =>
        all.map((tab) =>
          tab.id === activeQueryTab?.id
            ? {
                ...tab,
                title: payload.item.title,
                query: payload.item.query_text,
                snippetId: payload.item.id,
                dirty: false,
              }
            : tab
        )
      )
      await loadSnippets()
      setActiveNavTab('snippets')
    } catch (error) {
      setStatus({
        text: error instanceof Error ? error.message : 'Failed to save snippet',
        tone: 'error',
      })
    } finally {
      setSavingSnippet(false)
    }
  }

  async function autosaveSnippetDraft(tabId: string, snippetId: string, queryText: string) {
    const content = queryText.trim()
    if (!content) return

    setSavingSnippet(true)
    try {
      const payload = await fetchJson<{ item: SnippetItem }>('/api/snippets', {
        method: 'PATCH',
        body: JSON.stringify({
          id: snippetId,
          queryText: content,
        }),
      })
      setSnippetItems((items) => items.map((item) => (item.id === payload.item.id ? payload.item : item)))
      setQueryTabs((all) =>
        all.map((tab) =>
          tab.id === tabId && tab.query.trim() === content
            ? {
                ...tab,
                title: payload.item.title,
                query: payload.item.query_text,
                dirty: false,
              }
            : tab
        )
      )
    } catch (error) {
      setStatus({
        text: error instanceof Error ? error.message : 'Autosave failed',
        tone: 'warning',
      })
    } finally {
      setSavingSnippet(false)
    }
  }

  async function renameSnippet(item: SnippetItem, nextTitle?: string) {
    const title = (nextTitle ?? item.title).trim()
    if (!title || title === item.title) {
      setRenamingSnippetId(null)
      setRenameDraft('')
      return
    }
    try {
      const payload = await fetchJson<{ item: SnippetItem }>('/api/snippets', {
        method: 'PATCH',
        body: JSON.stringify({ id: item.id, title }),
      })
      setStatus({ text: `Renamed snippet: ${payload.item.title}`, tone: 'ok' })
      setSnippetItems((items) => items.map((entry) => (entry.id === payload.item.id ? payload.item : entry)))
      setQueryTabs((all) =>
        all.map((tab) =>
          tab.snippetId === payload.item.id
            ? {
                ...tab,
                title: payload.item.title,
              }
            : tab
        )
      )
      setRenamingSnippetId(null)
      setRenameDraft('')
    } catch (error) {
      setStatus({
        text: error instanceof Error ? error.message : 'Failed to rename snippet',
        tone: 'error',
      })
    }
  }

  async function duplicateSnippet(item: SnippetItem) {
    const suggestedTitle = `${item.title} copy`
    const title = window.prompt('Duplicate snippet as', suggestedTitle)?.trim()
    if (!title) return
    const payload = await fetchJson<{ item: SnippetItem }>('/api/snippets', {
      method: 'POST',
      body: JSON.stringify({ title, queryText: item.query_text }),
    })
    setStatus({ text: `Duplicated snippet: ${payload.item.title}`, tone: 'ok' })
    await loadSnippets()
    setActiveNavTab('snippets')
  }

  async function deleteSnippet(item: SnippetItem) {
    const confirmed = window.confirm(`Delete snippet "${item.title}"? This cannot be undone.`)
    if (!confirmed) return
    await fetchJson<{ ok: boolean }>('/api/snippets', {
      method: 'DELETE',
      body: JSON.stringify({ id: item.id }),
    })
    setSnippetItems((items) => items.filter((entry) => entry.id !== item.id))
    setQueryTabs((all) =>
      all.map((tab) => (tab.snippetId === item.id ? { ...tab, snippetId: undefined, dirty: true } : tab))
    )
    setStatus({ text: `Deleted snippet: ${item.title}`, tone: 'ok' })
  }

  function beginRenameSnippet(item: SnippetItem) {
    setRenamingSnippetId(item.id)
    setRenameDraft(item.title)
  }

  function cancelRenameSnippet() {
    setRenamingSnippetId(null)
    setRenameDraft('')
  }

  useEffect(() => {
    if (!activeQueryTab?.snippetId || !activeQueryTab.dirty) return
    const timer = window.setTimeout(() => {
      void autosaveSnippetDraft(activeQueryTab.id, activeQueryTab.snippetId as string, activeQueryTab.query)
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [activeQueryTab?.id, activeQueryTab?.snippetId, activeQueryTab?.query, activeQueryTab?.dirty])

  return {
    snippetItems,
    savingSnippet,
    renamingSnippetId,
    renameDraft,
    setRenameDraft,
    beginRenameSnippet,
    cancelRenameSnippet,
    loadSnippets,
    saveCurrentAsSnippet,
    renameSnippet,
    duplicateSnippet,
    deleteSnippet,
  }
}
