import type { editor as MonacoEditorNs } from 'monaco-editor'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorPane } from '../components/sql-editor/EditorPane'
import { SqlResultsPanel } from '../components/sql-editor/ResultsPanel'
import { SqlSidebar } from '../components/sql-editor/Sidebar'
import { SqlTabsBar } from '../components/sql-editor/TabsBar'
import { Connection, HistoryItem, QueryResult, QueryTab, SchemaTable, SnippetItem } from '../components/sql-editor/types'
import { detectOS, formatCell, formatTime, suffixWithLimit } from '../components/sql-editor/utils'
import ThemeToggle from '../components/theme-toggle'
import { fetchJson } from '../lib/http'

const DEFAULT_QUERY = '-- Write SQL and run with Ctrl/Cmd+Enter\nselect now() as server_time;'
const TABS_STORAGE_KEY = 'pgstudio-query-tabs-v1'
const ACTIVE_TAB_STORAGE_KEY = 'pgstudio-active-tab-v1'

export default function SqlEditorPage() {
  const [editorRef, setEditorRef] = useState<MonacoEditorNs.IStandaloneCodeEditor | null>(null)
  const [connections, setConnections] = useState<Connection[]>([])
  const [connectionName, setConnectionName] = useState('default')
  const [status, setStatus] = useState<{ text: string; tone: string }>({ text: 'Ready', tone: 'default' })
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([])
  const [snippetItems, setSnippetItems] = useState<SnippetItem[]>([])
  const [schemaTables, setSchemaTables] = useState<SchemaTable[]>([])
  const [tableColumnsByKey, setTableColumnsByKey] = useState<Record<string, string[]>>({})
  const [loadingColumnsByKey, setLoadingColumnsByKey] = useState<Record<string, boolean>>({})
  const [activeNavTab, setActiveNavTab] = useState<'history' | 'snippets' | 'explorer'>('explorer')
  const [expandedSchemas, setExpandedSchemas] = useState<Record<string, boolean>>({})
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({})
  const [historySearch, setHistorySearch] = useState('')
  const [running, setRunning] = useState(false)
  const [savingSnippet, setSavingSnippet] = useState(false)
  const [renamingSnippetId, setRenamingSnippetId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [hasSelection, setHasSelection] = useState(false)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [queryTabs, setQueryTabs] = useState<QueryTab[]>([
    { id: 'tab-1', title: 'Query 1', query: DEFAULT_QUERY, dirty: false },
  ])
  const [activeQueryTabId, setActiveQueryTabId] = useState('tab-1')
  const schemaTablesRef = useRef<SchemaTable[]>([])
  const tableColumnsByKeyRef = useRef<Record<string, string[]>>({})

  const activeQueryTab = useMemo(
    () => queryTabs.find((tab) => tab.id === activeQueryTabId) || queryTabs[0],
    [activeQueryTabId, queryTabs]
  )

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

  const filteredSchemaTables = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    if (!q) return schemaTables
    return schemaTables.filter(
      (item) => `${item.schema}.${item.table}`.toLowerCase().includes(q)
    )
  }, [schemaTables, historySearch])

  const schemaGroups = useMemo(() => {
    const grouped = new Map<string, SchemaTable[]>()
    for (const table of filteredSchemaTables) {
      const existing = grouped.get(table.schema) || []
      existing.push(table)
      grouped.set(table.schema, existing)
    }
    return [...grouped.entries()]
  }, [filteredSchemaTables])

  function toggleSchema(schema: string) {
    setExpandedSchemas((prev) => ({ ...prev, [schema]: !(prev[schema] ?? true) }))
  }

  async function loadColumnsForTable(schema: string, table: string) {
    const key = `${schema}.${table}`
    if (tableColumnsByKeyRef.current[key]?.length) return
    if (loadingColumnsByKey[key]) return
    setLoadingColumnsByKey((prev) => ({ ...prev, [key]: true }))
    try {
      const data = await fetchJson<{
        columns: Array<{ name: string }>
      }>(
        `/api/schema/columns?connectionName=${encodeURIComponent(connectionName)}&schema=${encodeURIComponent(
          schema
        )}&table=${encodeURIComponent(table)}`
      )
      setTableColumnsByKey((prev) => ({
        ...prev,
        [key]: (data.columns || []).map((c) => c.name),
      }))
    } finally {
      setLoadingColumnsByKey((prev) => ({ ...prev, [key]: false }))
    }
  }

  function toggleTable(schema: string, table: string) {
    const key = `${schema}.${table}`
    const nextExpanded = !(expandedTables[key] ?? false)
    setExpandedTables((prev) => ({ ...prev, [key]: nextExpanded }))
    if (nextExpanded) void loadColumnsForTable(schema, table)
  }

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

  function insertIntoEditor(sqlText: string) {
    if (!editorRef) {
      const base = activeQueryTab?.query || ''
      setActiveTabQuery(base ? `${base}\n${sqlText}` : sqlText)
      return
    }
    const selection = editorRef.getSelection()
    const model = editorRef.getModel()
    if (!selection || !model) return
    editorRef.executeEdits('insert-sql', [{ range: selection, text: sqlText, forceMoveMarkers: true }])
    const nextValue = model.getValue()
    setActiveTabQuery(nextValue)
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

  async function loadSchema() {
    const data = await fetchJson<{ tables: SchemaTable[] }>(
      `/api/schema?connectionName=${encodeURIComponent(connectionName)}`
    )
    setSchemaTables(data.tables || [])
  }

  async function runCurrentQuery() {
    if (running || !editorRef || !activeQueryTab) return

    const selection = editorRef.getSelection()
    const selectedQuery =
      selection && !selection.isEmpty() ? editorRef.getModel()?.getValueInRange(selection) || '' : ''

    const current = selectedQuery || activeQueryTab.query
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
      setQueryTabs((tabs) => tabs.map((t) => (t.id === activeQueryTab.id ? { ...t, dirty: false } : t)))
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
        setQueryTabs((tabs) =>
          tabs.map((tab) =>
            tab.id === activeQueryTab.id
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
      setQueryTabs((tabs) =>
        tabs.map((tab) =>
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
      setQueryTabs((tabs) =>
        tabs.map((tab) =>
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
      setQueryTabs((tabs) =>
        tabs.map((tab) =>
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
    setQueryTabs((tabs) =>
      tabs.map((tab) => (tab.snippetId === item.id ? { ...tab, snippetId: undefined, dirty: true } : tab))
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
    void loadSchema()
  }, [connectionName])

  useEffect(() => {
    schemaTablesRef.current = schemaTables
  }, [schemaTables])

  useEffect(() => {
    tableColumnsByKeyRef.current = tableColumnsByKey
  }, [tableColumnsByKey])

  useEffect(() => {
    if (schemaGroups.length === 0) return
    setExpandedSchemas((prev) => {
      const next = { ...prev }
      for (const [schema] of schemaGroups) {
        if (!(schema in next)) next[schema] = true
      }
      return next
    })
  }, [schemaGroups])

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

  useEffect(() => {
    if (!activeQueryTab?.snippetId || !activeQueryTab.dirty) return
    const timer = window.setTimeout(() => {
      void autosaveSnippetDraft(activeQueryTab.id, activeQueryTab.snippetId as string, activeQueryTab.query)
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [activeQueryTab?.id, activeQueryTab?.snippetId, activeQueryTab?.query, activeQueryTab?.dirty])

  return (
    <div className="layout-root">
      <SqlSidebar
        activeNavTab={activeNavTab}
        onChangeNavTab={setActiveNavTab}
        historySearch={historySearch}
        onChangeHistorySearch={setHistorySearch}
        onRefreshHistory={() => {
          void loadHistory()
        }}
        onClearHistory={() => {
          void clearHistory()
        }}
        onRefreshSnippets={() => {
          void loadSnippets()
        }}
        onSaveSnippet={(forceCreate) => {
          void saveCurrentAsSnippet(forceCreate)
        }}
        onRefreshSchema={() => {
          void loadSchema()
        }}
        onInsertTemplate={() => insertIntoEditor('select * from public.your_table limit 100;')}
        canSaveAs={Boolean(activeQueryTab?.snippetId)}
        savingSnippet={savingSnippet}
        filteredHistory={filteredHistory}
        filteredSnippets={filteredSnippets}
        schemaGroups={schemaGroups}
        expandedSchemas={expandedSchemas}
        onToggleSchema={toggleSchema}
        expandedTables={expandedTables}
        onToggleTable={toggleTable}
        loadingColumnsByKey={loadingColumnsByKey}
        tableColumnsByKey={tableColumnsByKey}
        onLoadHistoryQuery={(queryText) => setActiveTabQuery(queryText, false, null)}
        onLoadSnippetQuery={(queryText) => setActiveTabQuery(queryText, false, null)}
        onEditSnippet={openSnippetInTab}
        onDuplicateSnippet={(item) => {
          void duplicateSnippet(item)
        }}
        onRenameSnippet={(item, nextTitle) => {
          void renameSnippet(item, nextTitle)
        }}
        onDeleteSnippet={(item) => {
          void deleteSnippet(item)
        }}
        renamingSnippetId={renamingSnippetId}
        renameDraft={renameDraft}
        onChangeRenameDraft={setRenameDraft}
        onBeginRenameSnippet={beginRenameSnippet}
        onCancelRenameSnippet={cancelRenameSnippet}
        onInsertTableName={(schema, table) => insertIntoEditor(`${schema}.${table}`)}
        onInsertColumnName={insertIntoEditor}
        formatTime={formatTime}
      />

      <main className="layout-main">
        <div className="editor-panel-header">
          <div className="editor-title">SQL Editor</div>
          <div className="editor-header-right">
            <button className="btn small" onClick={() => createQueryTab()}>
              New
            </button>
            <span className={`status-pill ${status.tone}`}>{status.text}</span>
            <ThemeToggle />
            <select value={connectionName} onChange={(e) => setConnectionName(e.target.value)}>
              {connections.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <SqlTabsBar
          queryTabs={queryTabs}
          activeQueryTabId={activeQueryTabId}
          onSelectTab={setActiveQueryTabId}
          onRenameTab={renameTab}
          onCloseTab={closeTab}
        />

        <div className="editor-panel-body">
          <EditorPane
            value={activeQueryTab?.query || ''}
            onChangeValue={(value) => setActiveTabQuery(value)}
            onMountEditor={setEditorRef}
            onSelectionChange={setHasSelection}
            onRunQuery={() => {
              void runCurrentQuery()
            }}
            onSaveSnippet={() => {
              void saveCurrentAsSnippet()
            }}
            schemaTablesRef={schemaTablesRef}
            tableColumnsByKeyRef={tableColumnsByKeyRef}
          />

          <SqlResultsPanel result={result} formatCell={formatCell} />

          <div className="editor-footer">
            <button className="btn primary" disabled={running} onClick={() => void runCurrentQuery()}>
              {running ? 'Running...' : runLabel}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
