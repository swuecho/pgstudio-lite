import type { editor as MonacoEditorNs } from 'monaco-editor'
import { useEffect, useMemo, useState } from 'react'
import { fetchJson } from '../../lib/http'
import { detectOS, suffixWithLimit } from './utils'
import { Connection, HistoryItem, QueryResult, SnippetItem } from './types'
import { useSqlEditorExplorer } from './useSqlEditorExplorer'
import { useSqlEditorTabs } from './useSqlEditorTabs'

export function useSqlEditorState() {
  const [editorRef, setEditorRef] = useState<MonacoEditorNs.IStandaloneCodeEditor | null>(null)
  const [connections, setConnections] = useState<Connection[]>([])
  const [connectionName, setConnectionName] = useState('default')
  const [status, setStatus] = useState<{ text: string; tone: string }>({ text: 'Ready', tone: 'default' })
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([])
  const [snippetItems, setSnippetItems] = useState<SnippetItem[]>([])
  const [activeNavTab, setActiveNavTab] = useState<'history' | 'snippets' | 'explorer'>('explorer')
  const [historySearch, setHistorySearch] = useState('')
  const [running, setRunning] = useState(false)
  const [savingSnippet, setSavingSnippet] = useState(false)
  const [renamingSnippetId, setRenamingSnippetId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [hasSelection, setHasSelection] = useState(false)
  const [result, setResult] = useState<QueryResult | null>(null)

  const tabs = useSqlEditorTabs()
  const explorer = useSqlEditorExplorer(connectionName, historySearch)

  const runLabel = useMemo(() => {
    const shortcut = detectOS() === 'macos' ? '⌘↵' : 'Ctrl↵'
    return hasSelection ? `Run selected (${shortcut})` : `Run (${shortcut})`
  }, [hasSelection])

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    if (!q) return historyItems
    return historyItems.filter(
      (item) =>
        item.query_text.toLowerCase().includes(q) ||
        item.connection_name.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q)
    )
  }, [historyItems, historySearch])

  const filteredSnippets = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    if (!q) return snippetItems
    return snippetItems.filter(
      (item) => item.title.toLowerCase().includes(q) || item.query_text.toLowerCase().includes(q)
    )
  }, [snippetItems, historySearch])

  function insertIntoEditor(sqlText: string) {
    if (!editorRef) {
      const base = tabs.activeQueryTab?.query || ''
      tabs.setActiveTabQuery(base ? `${base}\n${sqlText}` : sqlText)
      return
    }
    const selection = editorRef.getSelection()
    const model = editorRef.getModel()
    if (!selection || !model) return
    editorRef.executeEdits('insert-sql', [{ range: selection, text: sqlText, forceMoveMarkers: true }])
    const nextValue = model.getValue()
    tabs.setActiveTabQuery(nextValue)
    editorRef.focus()
  }

  async function loadConnections() {
    const data = await fetchJson<{ connections: Connection[]; configured: boolean }>('/api/connections')
    setConnections(data.connections || [])
    if (!data.configured) {
      setStatus({ text: 'Set PG_CONNECTION_STRING to start', tone: 'warning' })
      return
    }
    if (data.connections[0]) setConnectionName(data.connections[0].name)
  }

  async function loadHistory() {
    const data = await fetchJson<{ items: HistoryItem[] }>('/api/history?limit=300')
    setHistoryItems(data.items || [])
  }

  async function loadSnippets() {
    const data = await fetchJson<{ items: SnippetItem[] }>('/api/snippets?limit=300')
    setSnippetItems(data.items || [])
  }

  async function runCurrentQuery() {
    if (running || !editorRef || !tabs.activeQueryTab) return

    const selection = editorRef.getSelection()
    const selectedQuery =
      selection && !selection.isEmpty() ? editorRef.getModel()?.getValueInRange(selection) || '' : ''

    const current = selectedQuery || tabs.activeQueryTab.query
    if (!current.trim()) {
      setStatus({ text: 'Query is empty', tone: 'warning' })
      return
    }

    setRunning(true)
    setStatus({ text: 'Running query...', tone: 'running' })

    try {
      const payload = await fetchJson<QueryResult>('/api/query', {
        method: 'POST',
        body: JSON.stringify({ connectionName, query: suffixWithLimit(current, 100) }),
      })
      setResult(payload)
      setStatus({ text: `Success in ${payload.durationMs} ms`, tone: 'ok' })
      tabs.setQueryTabs((all) => all.map((t) => (t.id === tabs.activeQueryTab?.id ? { ...t, dirty: false } : t)))
      await loadHistory()
    } catch (error) {
      setResult(null)
      setStatus({ text: error instanceof Error ? error.message : 'Query failed', tone: 'error' })
      await loadHistory()
    } finally {
      setRunning(false)
    }
  }

  async function clearHistory() {
    await fetchJson<{ ok: boolean }>('/api/history', { method: 'DELETE' })
    await loadHistory()
  }

  async function saveCurrentAsSnippet(forceCreate = false) {
    const content = (tabs.activeQueryTab?.query || '').trim()
    if (!content) {
      setStatus({ text: 'Query is empty', tone: 'warning' })
      return
    }

    try {
      setSavingSnippet(true)
      if (tabs.activeQueryTab?.snippetId && !forceCreate) {
        const payload = await fetchJson<{ item: SnippetItem }>('/api/snippets', {
          method: 'PATCH',
          body: JSON.stringify({
            id: tabs.activeQueryTab.snippetId,
            queryText: content,
          }),
        })
        setStatus({ text: `Updated snippet: ${payload.item.title}`, tone: 'ok' })
        setSnippetItems((items) => items.map((item) => (item.id === payload.item.id ? payload.item : item)))
        tabs.setQueryTabs((all) =>
          all.map((tab) =>
            tab.id === tabs.activeQueryTab?.id
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
      tabs.setQueryTabs((all) =>
        all.map((tab) =>
          tab.id === tabs.activeQueryTab?.id
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
      tabs.setQueryTabs((all) =>
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
      tabs.setQueryTabs((all) =>
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
    tabs.setQueryTabs((all) =>
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
    void loadConnections()
    void loadHistory()
    void loadSnippets()
  }, [])

  useEffect(() => {
    if (!connectionName) return
    void explorer.loadSchema()
  }, [connectionName])

  useEffect(() => {
    if (!tabs.activeQueryTab?.snippetId || !tabs.activeQueryTab.dirty) return
    const timer = window.setTimeout(() => {
      void autosaveSnippetDraft(
        tabs.activeQueryTab.id,
        tabs.activeQueryTab.snippetId as string,
        tabs.activeQueryTab.query
      )
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [tabs.activeQueryTab?.id, tabs.activeQueryTab?.snippetId, tabs.activeQueryTab?.query, tabs.activeQueryTab?.dirty])

  return {
    editorRef,
    setEditorRef,
    connections,
    connectionName,
    setConnectionName,
    status,
    activeNavTab,
    setActiveNavTab,
    historySearch,
    setHistorySearch,
    savingSnippet,
    filteredHistory,
    filteredSnippets,
    schemaGroups: explorer.schemaGroups,
    expandedSchemas: explorer.expandedSchemas,
    toggleSchema: explorer.toggleSchema,
    expandedTables: explorer.expandedTables,
    toggleTable: explorer.toggleTable,
    loadingColumnsByKey: explorer.loadingColumnsByKey,
    tableColumnsByKey: explorer.tableColumnsByKey,
    renamingSnippetId,
    renameDraft,
    setRenameDraft,
    beginRenameSnippet,
    cancelRenameSnippet,
    runLabel,
    running,
    result,
    queryTabs: tabs.queryTabs,
    activeQueryTabId: tabs.activeQueryTabId,
    setActiveQueryTabId: tabs.setActiveQueryTabId,
    renameTab: tabs.renameTab,
    closeTab: tabs.closeTab,
    createQueryTab: tabs.createQueryTab,
    activeQueryTab: tabs.activeQueryTab,
    setActiveTabQuery: tabs.setActiveTabQuery,
    openSnippetInTab: tabs.openSnippetInTab,
    duplicateSnippet,
    renameSnippet,
    deleteSnippet,
    runCurrentQuery,
    saveCurrentAsSnippet,
    clearHistory,
    loadHistory,
    loadSnippets,
    loadSchema: explorer.loadSchema,
    insertIntoEditor,
    schemaTablesRef: explorer.schemaTablesRef,
    tableColumnsByKeyRef: explorer.tableColumnsByKeyRef,
    setHasSelection,
  }
}
