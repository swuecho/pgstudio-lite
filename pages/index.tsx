import dynamic from 'next/dynamic'
import Link from 'next/link'
import { loader } from '@monaco-editor/react'
import type { editor as MonacoEditorNs } from 'monaco-editor'
import { useEffect, useMemo, useRef, useState } from 'react'
import ThemeToggle from '../components/theme-toggle'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

type QueryResult = {
  statements: Array<{
    command: string
    rowCount: number
    fields: string[]
    rows: Record<string, unknown>[]
  }>
  totalRows: number
  durationMs: number
}

type HistoryItem = {
  id: string
  query_text: string
  status: 'success' | 'error'
  duration_ms: number
  row_count: number | null
  executed_at: string
  connection_name: string
}

type SnippetItem = {
  id: string
  title: string
  query_text: string
  created_at: string
  updated_at: string
}

type Connection = { name: string }

type QueryTab = {
  id: string
  title: string
  query: string
  dirty: boolean
  snippetId?: string
}

type SchemaTable = {
  schema: string
  table: string
  estimatedRows: number
}

const DEFAULT_QUERY = '-- Write SQL and run with Ctrl/Cmd+Enter\nselect now() as server_time;'
const TABS_STORAGE_KEY = 'pgstudio-query-tabs-v1'
const ACTIVE_TAB_STORAGE_KEY = 'pgstudio-active-tab-v1'

if (typeof window !== 'undefined') {
  ;(window as any).MonacoEnvironment = {
    ...((window as any).MonacoEnvironment || {}),
    baseUrl: '/api/monaco/',
  }
}

loader.config({ paths: { vs: '/api/monaco' } })

function detectOS() {
  if (typeof navigator === 'undefined') return 'linux'
  const platform = navigator.platform.toLowerCase()
  if (platform.includes('mac')) return 'macos'
  if (platform.includes('win')) return 'windows'
  return 'linux'
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function getCurrentTheme() {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function checkIfAppendLimitRequired(sql: string, limit = 0) {
  const cleanedSql = sql.trim().replaceAll('\n', ' ').replaceAll(/\s+/g, ' ')
  const regMatch = cleanedSql.matchAll(/[a-zA-Z]*[0-9]*[;]+/g)
  const queries = [...regMatch]
  const indexSemiColon = cleanedSql.lastIndexOf(';')
  const hasComments = cleanedSql.includes('--')
  const hasMultipleQueries =
    queries.length > 1 || (indexSemiColon > 0 && indexSemiColon !== cleanedSql.length - 1)

  const appendAutoLimit =
    limit > 0 &&
    !hasComments &&
    !hasMultipleQueries &&
    cleanedSql.toLowerCase().startsWith('select') &&
    !cleanedSql.toLowerCase().match(/fetch\s+first/i) &&
    !cleanedSql.match(/limit$/i) &&
    !cleanedSql.match(/limit;$/i) &&
    !cleanedSql.match(/limit [0-9]* offset [0-9]*[;]?$/i) &&
    !cleanedSql.match(/limit [0-9]*[;]?$/i)

  return { cleanedSql, appendAutoLimit }
}

function suffixWithLimit(sql: string, limit = 0) {
  const { cleanedSql, appendAutoLimit } = checkIfAppendLimitRequired(sql, limit)
  return appendAutoLimit
    ? cleanedSql.endsWith(';')
      ? sql.replace(/[;]+$/, ` limit ${limit};`)
      : `${sql} limit ${limit};`
    : sql
}

async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`)
  return body as T
}

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

    if (activeQueryTab?.snippetId && !forceCreate) {
      const existingSnippet = snippetItems.find((item) => item.id === activeQueryTab.snippetId)
      const payload = await fetchJson<{ item: SnippetItem }>('/api/snippets', {
        method: 'PATCH',
        body: JSON.stringify({
          id: activeQueryTab.snippetId,
          title: existingSnippet?.title || activeQueryTab.title || 'Snippet',
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
  }

  async function autosaveSnippetDraft(tabId: string, snippetId: string, queryText: string) {
    const content = queryText.trim()
    if (!content) return

    const existingSnippet = snippetItems.find((item) => item.id === snippetId)
    setSavingSnippet(true)
    try {
      const payload = await fetchJson<{ item: SnippetItem }>('/api/snippets', {
        method: 'PATCH',
        body: JSON.stringify({
          id: snippetId,
          title: existingSnippet?.title || 'Snippet',
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
    } finally {
      setSavingSnippet(false)
    }
  }

  async function renameSnippet(item: SnippetItem) {
    const title = window.prompt('Snippet name', item.title)?.trim()
    if (!title || title === item.title) return
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

  async function deleteSnippetById(id: string) {
    await fetchJson<{ ok: boolean }>('/api/snippets', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    })
    setQueryTabs((tabs) =>
      tabs.map((tab) => (tab.snippetId === id ? { ...tab, snippetId: undefined, dirty: true } : tab))
    )
    await loadSnippets()
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
      <aside className="layout-rail">
        <button className="rail-btn active">SQL</button>
        <Link className="rail-btn link-btn" href="/table-editor">
          TB
        </Link>
      </aside>

      <aside className="layout-nav">
        <div className="layout-nav-header">
          <div className="nav-title">SQL Editor</div>
          <button className="btn small" onClick={() => createQueryTab()}>
            New
          </button>
        </div>

        <div className="layout-nav-tabs">
          <button
            className={`nav-tab ${activeNavTab === 'explorer' ? 'active' : ''}`}
            onClick={() => setActiveNavTab('explorer')}
          >
            Explorer
          </button>
          <button
            className={`nav-tab ${activeNavTab === 'snippets' ? 'active' : ''}`}
            onClick={() => setActiveNavTab('snippets')}
          >
            Snippets
          </button>
          <button
            className={`nav-tab ${activeNavTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveNavTab('history')}
          >
            History
          </button>
        </div>

        <div className="layout-nav-controls">
          <input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Search" />
          {activeNavTab === 'history' ? (
            <>
              <button className="btn small" onClick={() => void loadHistory()}>
                Refresh
              </button>
              <button className="btn small danger" onClick={() => void clearHistory()}>
                Clear
              </button>
            </>
          ) : activeNavTab === 'snippets' ? (
            <>
              <button className="btn small" onClick={() => void loadSnippets()}>
                Refresh
              </button>
              <button className="btn small" onClick={() => void saveCurrentAsSnippet()}>
                {activeQueryTab?.snippetId ? 'Update' : 'Save'}
              </button>
              {activeQueryTab?.snippetId && (
                <button className="btn small" onClick={() => void saveCurrentAsSnippet(true)}>
                  Save As
                </button>
              )}
              {savingSnippet && <span className="history-meta">Autosaving...</span>}
            </>
          ) : (
            <>
              <button className="btn small" onClick={() => void loadSchema()}>
                Refresh
              </button>
              <button
                className="btn small"
                onClick={() => insertIntoEditor('select * from public.your_table limit 100;')}
              >
                Insert
              </button>
            </>
          )}
        </div>

        <div className="layout-nav-list">
          {activeNavTab === 'history' ? (
            filteredHistory.map((item) => (
              <div
                key={item.id}
                className="history-item"
                role="button"
                tabIndex={0}
                onClick={() => setActiveTabQuery(item.query_text, false, null)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setActiveTabQuery(item.query_text, false, null)
                }}
              >
                <div className="history-top">
                  <span className={`pill ${item.status === 'success' ? 'ok' : 'error'}`}>{item.status}</span>
                  <span>{item.duration_ms}ms</span>
                </div>
                <div className="history-query">{item.query_text.split('\n').join(' ').slice(0, 140)}</div>
                <div className="history-meta">{formatTime(item.executed_at)}</div>
              </div>
            ))
          ) : activeNavTab === 'snippets' ? (
            filteredSnippets.map((item) => (
              <div key={item.id} className="history-item snippet-item">
                <div className="history-top">
                  <span className="pill ok">snippet</span>
                  <span>{item.title}</span>
                </div>
                <div className="history-query snippet-query">{item.query_text.split('\n').join(' ').slice(0, 180)}</div>
                <div className="history-meta">
                  <span>{formatTime(item.updated_at)}</span>
                </div>
                <div className="history-actions">
                  <button className="btn small" onClick={() => setActiveTabQuery(item.query_text, false, null)}>
                    Load
                  </button>
                  <button className="btn small" onClick={() => openSnippetInTab(item)}>
                    Edit
                  </button>
                  <button className="btn small" onClick={() => void duplicateSnippet(item)}>
                    Duplicate
                  </button>
                  <button className="btn small" onClick={() => void renameSnippet(item)}>
                    Rename
                  </button>
                  <button className="btn small danger" onClick={() => void deleteSnippetById(item.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))
          ) : (
            schemaGroups.map(([schema, tables]) => (
              <div key={schema} className="explorer-group">
                <button className="explorer-schema explorer-toggle-row" onClick={() => toggleSchema(schema)}>
                  <span className="explorer-chevron">{expandedSchemas[schema] === false ? '▸' : '▾'}</span>
                  <span>{schema}</span>
                </button>
                {expandedSchemas[schema] !== false &&
                  tables.map((table) => {
                    const tableKey = `${schema}.${table.table}`
                    const isExpanded = expandedTables[tableKey] === true
                    return (
                      <div key={tableKey} className="explorer-item">
                        <button
                          className="explorer-table explorer-toggle-row"
                          onClick={() => toggleTable(schema, table.table)}
                          title={`${isExpanded ? 'Collapse' : 'Expand'} ${schema}.${table.table}`}
                        >
                          <span className="explorer-chevron">{isExpanded ? '▾' : '▸'}</span>
                          <span>{table.table}</span>
                        </button>
                        <div className="explorer-actions">
                          <button
                            className="explorer-action-btn"
                            onClick={() => insertIntoEditor(`${schema}.${table.table}`)}
                            title={`Insert ${schema}.${table.table}`}
                          >
                            Insert table
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="explorer-columns">
                            {loadingColumnsByKey[tableKey] ? (
                              <div className="history-meta">Loading columns...</div>
                            ) : (
                              (tableColumnsByKey[tableKey] || []).slice(0, 80).map((column) => (
                                <button
                                  key={`${schema}.${table.table}.${column}`}
                                  className="explorer-col"
                                  onClick={() => insertIntoEditor(column)}
                                  title={`Insert ${column}`}
                                >
                                  {column}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            ))
          )}
        </div>
      </aside>

      <main className="layout-main">
        <div className="editor-panel-header">
          <div className="editor-title">SQL Editor</div>
          <div className="editor-header-right">
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

        <div className="sql-tabs-bar">
          {queryTabs.map((tab) => (
            <div key={tab.id} className={`sql-tab ${tab.id === activeQueryTabId ? 'active' : ''}`}>
              <button className="sql-tab-main" onClick={() => setActiveQueryTabId(tab.id)} onDoubleClick={() => renameTab(tab.id)}>
                {tab.title}
                {tab.snippetId && tab.dirty ? (
                  <span className="tab-unsaved-badge">Unsaved</span>
                ) : tab.dirty ? (
                  '*'
                ) : (
                  ''
                )}
              </button>
              <button className="sql-tab-close" onClick={() => closeTab(tab.id)} aria-label={`Close ${tab.title}`}>
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="editor-panel-body">
          <div className="editor-wrap">
            <MonacoEditor
              height="100%"
              language="pgsql"
              value={activeQueryTab?.query || ''}
              onChange={(value) => setActiveTabQuery(value || '')}
              onMount={(editor, monaco) => {
                setEditorRef(editor)
                monaco.editor.defineTheme('supabase-light', {
                  base: 'vs',
                  inherit: true,
                  rules: [
                    { token: '', background: 'fcfdff' },
                    { token: '', background: 'fcfdff', foreground: '101827' },
                    { token: 'string.sql', foreground: '1e9f6e' },
                    { token: 'comment', foreground: '7d8aa2' },
                    { token: 'predefined.sql', foreground: '1f2a3a' },
                  ],
                  colors: {
                    'editor.background': '#fcfdff',
                    'editorLineNumber.foreground': '#9ba9bf',
                    'editorLineNumber.activeForeground': '#55657f',
                  },
                })
                monaco.editor.defineTheme('supabase-dark', {
                  base: 'vs-dark',
                  inherit: true,
                  rules: [
                    { token: '', background: '111827', foreground: 'e5e7eb' },
                    { token: 'string.sql', foreground: '34d399' },
                    { token: 'comment', foreground: '7c8799' },
                    { token: 'predefined.sql', foreground: 'e5e7eb' },
                  ],
                  colors: {
                    'editor.background': '#111827',
                    'editorLineNumber.foreground': '#667085',
                    'editorLineNumber.activeForeground': '#d0d5dd',
                  },
                })

                const keywords = [
                  'select',
                  'from',
                  'where',
                  'insert',
                  'update',
                  'delete',
                  'join',
                  'left join',
                  'group by',
                  'order by',
                  'limit',
                  'offset',
                  'create table',
                  'alter table',
                ]

                const provider = monaco.languages.registerCompletionItemProvider('pgsql', {
                  provideCompletionItems(
                    model: MonacoEditorNs.ITextModel,
                    position: any
                  ) {
                    const word = model.getWordUntilPosition(position)
                    const range = {
                      startLineNumber: position.lineNumber,
                      endLineNumber: position.lineNumber,
                      startColumn: word.startColumn,
                      endColumn: word.endColumn,
                    }

                    const tableSuggestions = schemaTablesRef.current.map((item) => ({
                      label: `${item.schema}.${item.table}`,
                      kind: monaco.languages.CompletionItemKind.Class,
                      insertText: `${item.schema}.${item.table}`,
                      range,
                    }))

                    const columnSuggestions = Object.values(tableColumnsByKeyRef.current)
                      .flatMap((columns) => columns)
                      .filter((v, i, arr) => arr.indexOf(v) === i)
                      .map((column) => ({
                        label: column,
                        kind: monaco.languages.CompletionItemKind.Field,
                        insertText: column,
                        range,
                      }))

                    const keywordSuggestions = keywords.map((keyword) => ({
                      label: keyword,
                      kind: monaco.languages.CompletionItemKind.Keyword,
                      insertText: keyword,
                      range,
                    }))

                    return {
                      suggestions: [...keywordSuggestions, ...tableSuggestions, ...columnSuggestions],
                    }
                  },
                })

                const applyEditorTheme = () => {
                  monaco.editor.setTheme(getCurrentTheme() === 'dark' ? 'supabase-dark' : 'supabase-light')
                }
                applyEditorTheme()

                window.addEventListener('pgstudio:themechange', applyEditorTheme)
                editor.onDidDispose(() => {
                  provider.dispose()
                  window.removeEventListener('pgstudio:themechange', applyEditorTheme)
                })

                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                  void runCurrentQuery()
                })
                editor.onDidChangeCursorSelection((event) => setHasSelection(!event.selection.isEmpty()))
              }}
              options={{
                tabSize: 2,
                fontSize: 13,
                minimap: { enabled: false },
                wordWrap: 'on',
                lineNumbers: 'on',
                lineNumbersMinChars: 3,
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
              theme="supabase-light"
            />
          </div>

          <div className="results-wrap">
            <div className="results-head">
              <span>Results</span>
              <span className="history-meta">{result ? `${result.totalRows} rows` : ''}</span>
            </div>
            <div className="results-body">
              {!result ? (
                <div className="empty-state">Run a query to see results.</div>
              ) : (
                <div className="results-stack">
                  {result.statements.map((statement, index) => (
                    <div key={`${statement.command}-${index}`} className="result-block">
                      <div className="result-block-head">
                        <span>#{index + 1}</span>
                        <span>{statement.command}</span>
                        <span>{statement.rowCount} rows</span>
                      </div>
                      {statement.fields.length > 0 ? (
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                {statement.fields.map((field) => (
                                  <th key={field}>{field}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {statement.rows.map((row, rowIndex) => (
                                <tr key={rowIndex}>
                                  {statement.fields.map((field) => (
                                    <td key={`${rowIndex}-${field}`}>
                                      <code>{formatCell(row[field])}</code>
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="empty-state">Command executed successfully.</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

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
