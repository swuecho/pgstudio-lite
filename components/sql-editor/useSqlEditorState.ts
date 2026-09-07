import type { editor as MonacoEditorNs } from 'monaco-editor'
import { useEffect, useMemo, useState, type SetStateAction } from 'react'
import { runQuery } from '@/features/sql/sql.service'
import { buildExplainQuery, detectOS } from './utils'
import { currentStatementRange } from '@/lib/sql-statement-range'
import { HttpError } from '@/lib/http'
import type { SnippetItem } from './types'
import { useSqlEditorExplorer } from './useSqlEditorExplorer'
import { useSqlEditorHistory } from './useSqlEditorHistory'
import { useSqlEditorSnippets } from './useSqlEditorSnippets'
import { useSqlEditorTabs } from './useSqlEditorTabs'
import { useActiveConnection } from '../shared/hooks/useActiveConnection'

export function useSqlEditorState() {
  const [editorRef, setEditorRef] = useState<MonacoEditorNs.IStandaloneCodeEditor | null>(null)
  const [statusesByTab, setStatusesByTab] = useState<Record<string, { text: string; tone: string }>>({})
  const [activeNavTab, setActiveNavTab] = useState<'history' | 'snippets' | 'explorer'>('explorer')
  const [historySearch, setHistorySearch] = useState('')
  const [running, setRunning] = useState(false)
  const [explaining, setExplaining] = useState(false)
  const [hasSelection, setHasSelection] = useState(false)
  const { connections, connectionName: defaultConnectionName } = useActiveConnection({
    onUnconfigured: () => setStatus({ text: 'Set PG_CONNECTION_STRING to start', tone: 'warning' }),
  })

  const tabs = useSqlEditorTabs()
  const { setQueryTabs } = tabs
  const status = statusesByTab[tabs.activeQueryTabId] || { text: 'Ready', tone: 'default' }
  function setStatus(next: SetStateAction<{ text: string; tone: string }>) {
    setStatusesByTab((previous) => ({
      ...previous,
      [tabs.activeQueryTabId]:
        typeof next === 'function'
          ? next(previous[tabs.activeQueryTabId] || { text: 'Ready', tone: 'default' })
          : next,
    }))
  }
  const connectionName = tabs.activeQueryTab?.connectionName || defaultConnectionName
  const rowLimit = tabs.activeQueryTab?.rowLimit || 100
  const [errorsByTab, setErrorsByTab] = useState<
    Record<
      string,
      { message: string; hint?: string; detail?: string; offset?: number; query: string } | undefined
    >
  >({})
  const queryError = tabs.activeQueryTab ? errorsByTab[tabs.activeQueryTab.id] : undefined
  const setConnectionName = (name: string) =>
    tabs.setQueryTabs((all) =>
      all.map((tab) => (tab.id === tabs.activeQueryTabId ? { ...tab, connectionName: name } : tab))
    )
  const setRowLimit = (limit: number) =>
    tabs.setQueryTabs((all) =>
      all.map((tab) => (tab.id === tabs.activeQueryTabId ? { ...tab, rowLimit: limit } : tab))
    )
  useEffect(() => {
    if (
      !defaultConnectionName ||
      !connections.some((connection) => connection.name === defaultConnectionName)
    )
      return
    setQueryTabs((all) =>
      all.some((tab) => !tab.connectionName)
        ? all.map((tab) => (tab.connectionName ? tab : { ...tab, connectionName: defaultConnectionName }))
        : all
    )
  }, [connections, defaultConnectionName, setQueryTabs])

  const result = tabs.activeQueryTab ? (tabs.resultsByTabId[tabs.activeQueryTab.id] ?? null) : null

  function getEditorQueryText() {
    return editorRef?.getModel()?.getValue() ?? tabs.activeQueryTab?.query ?? ''
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
    return hasSelection ? `Run selected (${shortcut})` : `Run statement (${shortcut})`
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

  function getActiveQuery(all = false) {
    const model = editorRef?.getModel()
    const sql = getEditorQueryText()
    if (all || !model) return { text: sql, start: 0 }
    const selection = editorRef?.getSelection()
    if (selection && !selection.isEmpty())
      return {
        text: model.getValueInRange(selection),
        start: model.getOffsetAt(selection.getStartPosition()),
      }
    const position = editorRef?.getPosition()
    const range = currentStatementRange(sql, position ? model.getOffsetAt(position) : 0)
    return range ? { text: sql.slice(range.start, range.end), start: range.start } : { text: '', start: 0 }
  }

  function recordError(tabId: string, error: unknown, start: number, text: string, query: string) {
    const details =
      error instanceof HttpError
        ? (error.details as { position?: number; hint?: string; detail?: string } | undefined)
        : undefined
    const offset = details?.position
      ? start +
        Array.from(text)
          .slice(0, details.position - 1)
          .join('').length
      : undefined
    setErrorsByTab((previous) => ({
      ...previous,
      [tabId]: {
        message: error instanceof Error ? error.message : 'Query failed',
        hint: details?.hint,
        detail: details?.detail,
        offset,
        query,
      },
    }))
  }

  async function runCurrentQuery(all = false) {
    if (running || explaining || !editorRef || !tabs.activeQueryTab) return

    const execution = getActiveQuery(all)
    const current = execution.text
    const submittedQuery = getEditorQueryText()
    if (!current.trim()) {
      setStatus({ text: 'Query is empty', tone: 'warning' })
      return
    }

    if (!connections.some((connection) => connection.name === connectionName)) {
      setStatus({ text: 'Choose an available connection for this tab', tone: 'warning' })
      return
    }
    const tabId = tabs.activeQueryTab.id
    setErrorsByTab((previous) => ({ ...previous, [tabId]: undefined }))
    setRunning(true)
    setStatus({ text: 'Running query...', tone: 'running' })

    try {
      const payload = await runQuery(connectionName, current, rowLimit)
      tabs.setTabResult(tabId, {
        ...payload,
        connectionName,
        ranAt: payload.ranAt || new Date().toISOString(),
      })
      setStatus({ text: `Success in ${payload.durationMs} ms`, tone: 'ok' })
      await history.loadHistory()
    } catch (error) {
      recordError(tabId, error, execution.start, current, submittedQuery)
      setStatus({ text: error instanceof Error ? error.message : 'Query failed', tone: 'error' })
      await history.loadHistory()
    } finally {
      setRunning(false)
    }
  }

  async function runExplainQuery() {
    if (running || explaining || !editorRef || !tabs.activeQueryTab) return

    const execution = getActiveQuery()
    const current = execution.text
    const submittedQuery = getEditorQueryText()
    if (!current.trim()) {
      setStatus({ text: 'Query is empty', tone: 'warning' })
      return
    }

    const connection = connections.find((item) => item.name === connectionName)
    if (!connection) {
      setStatus({ text: 'Choose an available connection for this tab', tone: 'warning' })
      return
    }
    const readOnly = Boolean(connection.readOnly)
    const explainQuery = buildExplainQuery(current, readOnly)

    const tabId = tabs.activeQueryTab.id
    setErrorsByTab((previous) => ({ ...previous, [tabId]: undefined }))
    setExplaining(true)
    setStatus({
      text: readOnly ? 'Explaining query (no analyze on read-only)...' : 'Explaining query (analyze)...',
      tone: 'running',
    })

    try {
      const payload = await runQuery(connectionName, explainQuery)
      tabs.setTabResult(tabId, {
        ...payload,
        connectionName,
        ranAt: payload.ranAt || new Date().toISOString(),
      })
      setStatus({ text: `Explain finished in ${payload.durationMs} ms`, tone: 'ok' })
      await history.loadHistory()
    } catch (error) {
      recordError(
        tabId,
        error,
        execution.start -
          (explainQuery.length - current.trim().replace(/;+\s*$/, '').length) +
          current.indexOf(current.trim()),
        explainQuery,
        submittedQuery
      )
      setStatus({ text: error instanceof Error ? error.message : 'Explain failed', tone: 'error' })
      await history.loadHistory()
    } finally {
      setExplaining(false)
    }
  }

  return {
    editorRef,
    setEditorRef,
    rowLimit,
    setRowLimit,
    queryError,
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
    createQueryTab: (query?: string, options?: Parameters<typeof tabs.createQueryTab>[1]) =>
      tabs.createQueryTab(query, { ...options, connectionName }),
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
