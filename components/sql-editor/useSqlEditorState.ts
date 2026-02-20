import type { editor as MonacoEditorNs } from 'monaco-editor'
import { useEffect, useMemo, useState } from 'react'
import { getConnections, runQuery } from '../../features/sql/sql.service'
import { detectOS, suffixWithLimit } from './utils'
import { Connection, QueryResult } from './types'
import { useSqlEditorExplorer } from './useSqlEditorExplorer'
import { useSqlEditorHistory } from './useSqlEditorHistory'
import { useSqlEditorSnippets } from './useSqlEditorSnippets'
import { useSqlEditorTabs } from './useSqlEditorTabs'

export function useSqlEditorState() {
  const [editorRef, setEditorRef] = useState<MonacoEditorNs.IStandaloneCodeEditor | null>(null)
  const [connections, setConnections] = useState<Connection[]>([])
  const [connectionName, setConnectionName] = useState('default')
  const [status, setStatus] = useState<{ text: string; tone: string }>({ text: 'Ready', tone: 'default' })
  const [activeNavTab, setActiveNavTab] = useState<'history' | 'snippets' | 'explorer'>('explorer')
  const [historySearch, setHistorySearch] = useState('')
  const [running, setRunning] = useState(false)
  const [hasSelection, setHasSelection] = useState(false)
  const [result, setResult] = useState<QueryResult | null>(null)

  const tabs = useSqlEditorTabs()
  const explorer = useSqlEditorExplorer(connectionName, historySearch)
  const history = useSqlEditorHistory(historySearch)
  const snippets = useSqlEditorSnippets({
    activeQueryTab: tabs.activeQueryTab,
    setQueryTabs: tabs.setQueryTabs,
    setStatus,
    setActiveNavTab,
  })

  const runLabel = useMemo(() => {
    const shortcut = detectOS() === 'macos' ? '⌘↵' : 'Ctrl↵'
    return hasSelection ? `Run selected (${shortcut})` : `Run (${shortcut})`
  }, [hasSelection])

  const filteredSnippets = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    if (!q) return snippets.snippetItems
    return snippets.snippetItems.filter(
      (item) => item.title.toLowerCase().includes(q) || item.query_text.toLowerCase().includes(q)
    )
  }, [snippets.snippetItems, historySearch])

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
    const data = await getConnections()
    setConnections(data.connections || [])
    if (!data.configured) {
      setStatus({ text: 'Set PG_CONNECTION_STRING to start', tone: 'warning' })
      return
    }
    if (data.connections[0]) setConnectionName(data.connections[0].name)
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
      const payload = await runQuery(connectionName, suffixWithLimit(current, 100))
      setResult(payload)
      setStatus({ text: `Success in ${payload.durationMs} ms`, tone: 'ok' })
      tabs.setQueryTabs((all) => all.map((t) => (t.id === tabs.activeQueryTab?.id ? { ...t, dirty: false } : t)))
      await history.loadHistory()
    } catch (error) {
      setResult(null)
      setStatus({ text: error instanceof Error ? error.message : 'Query failed', tone: 'error' })
      await history.loadHistory()
    } finally {
      setRunning(false)
    }
  }


  useEffect(() => {
    void loadConnections()
    void history.loadHistory()
    void snippets.loadSnippets()
  }, [])

  useEffect(() => {
    if (!connectionName) return
    void explorer.loadSchema()
  }, [connectionName])

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
    savingSnippet: snippets.savingSnippet,
    filteredHistory: history.filteredHistory,
    filteredSnippets,
    schemaGroups: explorer.schemaGroups,
    expandedSchemas: explorer.expandedSchemas,
    toggleSchema: explorer.toggleSchema,
    expandedTables: explorer.expandedTables,
    toggleTable: explorer.toggleTable,
    loadingColumnsByKey: explorer.loadingColumnsByKey,
    tableColumnsByKey: explorer.tableColumnsByKey,
    renamingSnippetId: snippets.renamingSnippetId,
    renameDraft: snippets.renameDraft,
    setRenameDraft: snippets.setRenameDraft,
    beginRenameSnippet: snippets.beginRenameSnippet,
    cancelRenameSnippet: snippets.cancelRenameSnippet,
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
    duplicateSnippet: snippets.duplicateSnippet,
    renameSnippet: snippets.renameSnippet,
    deleteSnippet: snippets.deleteSnippet,
    runCurrentQuery,
    saveCurrentAsSnippet: snippets.saveCurrentAsSnippet,
    clearHistory: history.clearHistory,
    loadHistory: history.loadHistory,
    loadSnippets: snippets.loadSnippets,
    loadSchema: explorer.loadSchema,
    insertIntoEditor,
    schemaTablesRef: explorer.schemaTablesRef,
    tableColumnsByKeyRef: explorer.tableColumnsByKeyRef,
    setHasSelection,
  }
}
