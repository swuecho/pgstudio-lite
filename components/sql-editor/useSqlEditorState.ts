import type { editor as MonacoEditorNs } from 'monaco-editor'
import { useEffect, useMemo, useState } from 'react'
import { runQuery } from '../../features/sql/sql.service'
import { buildExplainQuery, detectOS, suffixWithLimit } from './utils'
import type { SnippetItem } from './types'
import { useSqlEditorExplorer } from './useSqlEditorExplorer'
import { useSqlEditorHistory } from './useSqlEditorHistory'
import { useSqlEditorSnippets } from './useSqlEditorSnippets'
import { useSqlEditorTabs } from './useSqlEditorTabs'
import { useActiveConnection } from '../shared/hooks/useActiveConnection'

export function useSqlEditorState() {
  const [editorRef, setEditorRef] = useState<MonacoEditorNs.IStandaloneCodeEditor | null>(null)
  const [status, setStatus] = useState<{ text: string; tone: string }>({ text: 'Ready', tone: 'default' })
  const [activeNavTab, setActiveNavTab] = useState<'history' | 'snippets' | 'explorer'>('explorer')
  const [historySearch, setHistorySearch] = useState('')
  const [running, setRunning] = useState(false)
  const [explaining, setExplaining] = useState(false)
  const [hasSelection, setHasSelection] = useState(false)
  const { connections, connectionName, setConnectionName } = useActiveConnection({
    onUnconfigured: () => setStatus({ text: 'Set PG_CONNECTION_STRING to start', tone: 'warning' }),
  })

  const tabs = useSqlEditorTabs()

  const result = tabs.activeQueryTab ? (tabs.resultsByTabId[tabs.activeQueryTab.id] ?? null) : null

  function getEditorQueryText() {
    return editorRef?.getModel()?.getValue() || tabs.activeQueryTab?.query || ''
  }

  const explorer = useSqlEditorExplorer(connectionName, historySearch)
  const history = useSqlEditorHistory(historySearch, connectionName)
  const snippets = useSqlEditorSnippets({
    connectionName,
    activeQueryTab: tabs.activeQueryTab,
    getQueryText: getEditorQueryText,
    setQueryTabs: tabs.setQueryTabs,
    setStatus,
    setActiveNavTab,
  })

  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    setIsMac(detectOS() === 'macos')
  }, [])

  const runLabel = useMemo(() => {
    const shortcut = isMac ? '⌘↵' : 'Ctrl↵'
    return hasSelection ? `Run selected (${shortcut})` : `Run (${shortcut})`
  }, [hasSelection, isMac])

  const filteredSnippets = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    if (!q) return snippets.snippetItems
    return snippets.snippetItems.filter(
      (item) => item.title.toLowerCase().includes(q) || item.query_text.toLowerCase().includes(q)
    )
  }, [snippets.snippetItems, historySearch])

  function insertIntoEditor(sqlText: string) {
    if (!editorRef) {
      const base = getEditorQueryText()
      tabs.setActiveTabQuery(base ? `${base}\n${sqlText}` : sqlText)
      return
    }
    const selection = editorRef.getSelection()
    const model = editorRef.getModel()
    if (!selection || !model) return
    editorRef.executeEdits('insert-sql', [{ range: selection, text: sqlText, forceMoveMarkers: true }])
    tabs.setActiveTabQuery(model.getValue())
    editorRef.focus()
  }

  function getActiveQueryText() {
    if (!editorRef || !tabs.activeQueryTab) return ''
    const selection = editorRef.getSelection()
    const selectedQuery =
      selection && !selection.isEmpty() ? editorRef.getModel()?.getValueInRange(selection) || '' : ''
    return selectedQuery || getEditorQueryText()
  }

  async function runCurrentQuery() {
    if (running || explaining || !editorRef || !tabs.activeQueryTab) return

    const current = getActiveQueryText()
    if (!current.trim()) {
      setStatus({ text: 'Query is empty', tone: 'warning' })
      return
    }

    const tabId = tabs.activeQueryTab.id
    setRunning(true)
    setStatus({ text: 'Running query...', tone: 'running' })

    try {
      const payload = await runQuery(connectionName, suffixWithLimit(current, 100))
      tabs.setTabResult(tabId, payload)
      setStatus({ text: `Success in ${payload.durationMs} ms`, tone: 'ok' })
      tabs.setQueryTabs((all) => all.map((t) => (t.id === tabId ? { ...t, dirty: false } : t)))
      await history.loadHistory()
    } catch (error) {
      tabs.setTabResult(tabId, null)
      setStatus({ text: error instanceof Error ? error.message : 'Query failed', tone: 'error' })
      await history.loadHistory()
    } finally {
      setRunning(false)
    }
  }

  async function runExplainQuery() {
    if (running || explaining || !editorRef || !tabs.activeQueryTab) return

    const current = getActiveQueryText()
    if (!current.trim()) {
      setStatus({ text: 'Query is empty', tone: 'warning' })
      return
    }

    const connection = connections.find((item) => item.name === connectionName)
    const readOnly = Boolean(connection?.readOnly)
    const explainQuery = buildExplainQuery(current, readOnly)

    const tabId = tabs.activeQueryTab.id
    setExplaining(true)
    setStatus({
      text: readOnly ? 'Explaining query (no analyze on read-only)...' : 'Explaining query (analyze)...',
      tone: 'running',
    })

    try {
      const payload = await runQuery(connectionName, explainQuery)
      tabs.setTabResult(tabId, payload)
      setStatus({ text: `Explain finished in ${payload.durationMs} ms`, tone: 'ok' })
      await history.loadHistory()
    } catch (error) {
      tabs.setTabResult(tabId, null)
      setStatus({ text: error instanceof Error ? error.message : 'Explain failed', tone: 'error' })
      await history.loadHistory()
    } finally {
      setExplaining(false)
    }
  }

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
    loadingSnippets: snippets.loadingSnippets,
    filteredHistory: history.filteredHistory,
    loadingHistory: history.loadingHistory,
    filteredSnippets,
    schemaGroups: explorer.schemaGroups,
    expandedSchemas: explorer.expandedSchemas,
    toggleSchema: explorer.toggleSchema,
    expandedTables: explorer.expandedTables,
    toggleTable: explorer.toggleTable,
    loadingColumnsByKey: explorer.loadingColumnsByKey,
    tableColumnsByKey: explorer.tableColumnsByKey,
    loadingSchema: explorer.loadingSchema,
    renamingSnippetId: snippets.renamingSnippetId,
    renameDraft: snippets.renameDraft,
    setRenameDraft: snippets.setRenameDraft,
    beginRenameSnippet: snippets.beginRenameSnippet,
    cancelRenameSnippet: snippets.cancelRenameSnippet,
    runLabel,
    running,
    explaining,
    result,
    queryTabs: tabs.queryTabs,
    activeQueryTabId: tabs.activeQueryTabId,
    setActiveQueryTabId: tabs.setActiveQueryTabId,
    renameTab: tabs.renameTab,
    closeTab: tabs.closeTab,
    createQueryTab: tabs.createQueryTab,
    activeQueryTab: tabs.activeQueryTab,
    setActiveTabQuery: tabs.setActiveTabQuery,
    setTabQuery: tabs.setTabQuery,
    getEditorQueryText,
    openSnippetInTab: (item: SnippetItem) => tabs.openSnippetInTab(item, connectionName),
    getSuggestedSnippetTitle: snippets.getSuggestedSnippetTitle,
    getDuplicateSnippetTitle: snippets.getDuplicateSnippetTitle,
    duplicateSnippet: snippets.duplicateSnippet,
    renameSnippet: snippets.renameSnippet,
    deleteSnippet: snippets.deleteSnippet,
    runCurrentQuery,
    runExplainQuery,
    saveCurrentAsSnippet: snippets.saveCurrentAsSnippet,
    clearHistory: history.clearHistory,
    loadHistory: history.loadHistory,
    loadSnippets: snippets.loadSnippets,
    loadSchema: explorer.loadSchema,
    insertIntoEditor,
    schemaTablesRef: explorer.schemaTablesRef,
    tableColumnsByKeyRef: explorer.tableColumnsByKeyRef,
    ensureColumnsForTable: explorer.ensureColumnsForTable,
    setHasSelection,
  }
}
