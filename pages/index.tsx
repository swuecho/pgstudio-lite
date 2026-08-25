import { useRouter } from 'next/router'
import { PageHead } from '@/components/shared/PageHead'
import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react'
import { SettingsPanel } from '../components/settings/SettingsPanel'
import { SettingsButton } from '../components/settings/SettingsButton'
import { ConfirmDialog, PromptDialog, QuickActionsDialog } from '../components/shared/Dialog'
import { ErrorBoundary } from '../components/shared/ErrorBoundary'
import { EditorPane } from '../components/sql-editor/EditorPane'
import { SqlResultsPanel } from '../components/sql-editor/ResultsPanel'
import { SqlSidebar } from '../components/sql-editor/Sidebar'
import { SqlTabsBar } from '../components/sql-editor/TabsBar'
import { useSqlEditorState } from '../components/sql-editor/useSqlEditorState'
import { formatCell, formatTime } from '../components/sql-editor/utils'
import { useSidebarResizer } from '../hooks/useSidebarResizer'
import styles from './SqlEditorPage.module.css'

export default function SqlEditorPage() {
  const MIN_EDITOR_HEIGHT = 140
  const MIN_RESULTS_HEIGHT = 120
  const SPLITTER_HEIGHT = 12

  const state = useSqlEditorState()
  const router = useRouter()

  useEffect(() => {
    if (!router.isReady) return
    const raw = router.query.query
    const query = Array.isArray(raw) ? raw[0] : raw
    if (typeof query !== 'string' || !query.trim()) return
    const title = typeof router.query.title === 'string' ? router.query.title : 'From Activity'
    state.createQueryTab(query, { title, dirty: true })
    const { query: _omit, title: _omitTitle, ...rest } = router.query
    void router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady])
  const { sidebarWidth, handleWidthResizerMouseDown } = useSidebarResizer()
  const [resultsHeight, setResultsHeight] = useState(260)
  const [isResizing, setIsResizing] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(false)
  const [tabRenameState, setTabRenameState] = useState<{ tabId: string; title: string } | null>(null)
  const [saveSnippetState, setSaveSnippetState] = useState<{ forceCreate: boolean; title: string } | null>(
    null
  )
  const [duplicateSnippetState, setDuplicateSnippetState] = useState<{ id: string; title: string } | null>(
    null
  )
  const [deleteSnippetId, setDeleteSnippetId] = useState<string | null>(null)
  const sidebarSearchRef = useRef<HTMLInputElement>(null)
  const editorPanelBodyRef = useRef<HTMLDivElement>(null)
  const editorFooterRef = useRef<HTMLDivElement>(null)

  const duplicateSnippetItem =
    state.filteredSnippets.find((item) => item.id === duplicateSnippetState?.id) || null
  const deleteSnippetItem = state.filteredSnippets.find((item) => item.id === deleteSnippetId) || null

  const quickActionItems = [
    {
      id: 'new',
      title: 'New query tab',
      description: 'Create a fresh SQL tab.',
      onSelect: () => state.createQueryTab(),
    },
    {
      id: 'run',
      title: 'Run current query',
      description: 'Execute the active selection or tab.',
      onSelect: () => {
        void state.runCurrentQuery()
      },
    },
    {
      id: 'explain',
      title: 'Explain query',
      description: 'Run EXPLAIN on the active selection or tab.',
      onSelect: () => {
        void state.runExplainQuery()
      },
    },
    {
      id: 'save',
      title: 'Save snippet',
      description: 'Save or update the current SQL as a snippet.',
      onSelect: () => {
        openSaveSnippetDialog(false)
      },
    },
    {
      id: 'search',
      title: 'Focus sidebar search',
      description: 'Jump to the current sidebar search box.',
      onSelect: () => {
        sidebarSearchRef.current?.focus()
        sidebarSearchRef.current?.select()
      },
    },
    {
      id: 'explorer',
      title: 'Open explorer',
      description: 'Switch the sidebar to schema explorer.',
      onSelect: () => state.setActiveNavTab('explorer'),
    },
    {
      id: 'snippets',
      title: 'Open snippets',
      description: 'Switch the sidebar to snippets.',
      onSelect: () => state.setActiveNavTab('snippets'),
    },
    {
      id: 'history',
      title: 'Open history',
      description: 'Switch the sidebar to query history.',
      onSelect: () => state.setActiveNavTab('history'),
    },
  ]

  function openSaveSnippetDialog(forceCreate: boolean) {
    if (!state.getEditorQueryText().trim()) {
      void state.saveCurrentAsSnippet({ forceCreate })
      return
    }

    const canUpdateBoundSnippet =
      state.activeQueryTab?.snippetId &&
      state.activeQueryTab.snippetConnectionName === state.connectionName &&
      !forceCreate

    if (canUpdateBoundSnippet) {
      void state.saveCurrentAsSnippet({ forceCreate: false })
      return
    }

    setSaveSnippetState({
      forceCreate,
      title: state.getSuggestedSnippetTitle(state.getEditorQueryText()),
    })
  }

  function submitSaveSnippetDialog() {
    if (!saveSnippetState) return
    void state.saveCurrentAsSnippet({
      forceCreate: saveSnippetState.forceCreate,
      title: saveSnippetState.title,
    })
    setSaveSnippetState(null)
  }

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      if (target.isContentEditable) return true
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === 'k') {
        event.preventDefault()
        setShowQuickActions(true)
        return
      }

      if (
        event.key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault()
        sidebarSearchRef.current?.focus()
        sidebarSearchRef.current?.select()
        return
      }

      if (event.key === 'Escape' && document.activeElement === sidebarSearchRef.current) {
        if (state.historySearch) {
          state.setHistorySearch('')
        } else {
          sidebarSearchRef.current?.blur()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.historySearch, state.setHistorySearch])

  useEffect(() => {
    return () => {
      document.body.classList.remove('resizing-sql-split')
    }
  }, [])

  const startResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const panel = editorPanelBodyRef.current
    if (!panel) return

    const startY = event.clientY
    const startHeight = resultsHeight
    setIsResizing(true)
    document.body.classList.add('resizing-sql-split')

    const onMouseMove = (moveEvent: MouseEvent) => {
      const footerHeight = editorFooterRef.current?.offsetHeight ?? 0
      const availableHeight = panel.clientHeight - footerHeight - SPLITTER_HEIGHT
      const maxResultsHeight = Math.max(MIN_RESULTS_HEIGHT, availableHeight - MIN_EDITOR_HEIGHT)
      const deltaY = moveEvent.clientY - startY
      const nextHeight = Math.min(maxResultsHeight, Math.max(MIN_RESULTS_HEIGHT, startHeight - deltaY))
      setResultsHeight(nextHeight)
    }

    const onMouseUp = () => {
      setIsResizing(false)
      document.body.classList.remove('resizing-sql-split')
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div
      className={styles.layoutRoot}
      style={{ gridTemplateColumns: `52px ${sidebarWidth}px minmax(0, 1fr)` }}
    >
      <PageHead title="SQL Editor" />
      <SqlSidebar
        searchInputRef={sidebarSearchRef}
        connectionName={state.connectionName}
        activeNavTab={state.activeNavTab}
        onChangeNavTab={state.setActiveNavTab}
        historySearch={state.historySearch}
        onChangeHistorySearch={state.setHistorySearch}
        onRefreshHistory={() => {
          void state.loadHistory()
        }}
        onClearHistory={() => {
          void state.clearHistory()
        }}
        onRefreshSnippets={() => {
          void state.loadSnippets()
        }}
        onSaveSnippet={(forceCreate) => {
          openSaveSnippetDialog(Boolean(forceCreate))
        }}
        onRefreshSchema={() => {
          void state.loadSchema()
        }}
        onInsertTemplate={() => state.insertIntoEditor('select * from public.your_table limit 100;')}
        canSaveAs={Boolean(state.activeQueryTab?.snippetId)}
        savingSnippet={state.savingSnippet}
        loadingHistory={state.loadingHistory}
        loadingSnippets={state.loadingSnippets}
        loadingSchema={state.loadingSchema}
        filteredHistory={state.filteredHistory}
        filteredSnippets={state.filteredSnippets}
        schemaGroups={state.schemaGroups}
        expandedSchemas={state.expandedSchemas}
        onToggleSchema={state.toggleSchema}
        expandedTables={state.expandedTables}
        onToggleTable={state.toggleTable}
        loadingColumnsByKey={state.loadingColumnsByKey}
        tableColumnsByKey={state.tableColumnsByKey}
        onLoadHistoryQuery={(queryText) => state.setActiveTabQuery(queryText, false, null)}
        onLoadSnippetQuery={(queryText) => state.setActiveTabQuery(queryText, false, null)}
        onEditSnippet={state.openSnippetInTab}
        onDuplicateSnippet={(item) => {
          setDuplicateSnippetState({ id: item.id, title: state.getDuplicateSnippetTitle(item) })
        }}
        onRenameSnippet={(item, nextTitle) => {
          void state.renameSnippet(item, nextTitle)
        }}
        onDeleteSnippet={(item) => {
          setDeleteSnippetId(item.id)
        }}
        renamingSnippetId={state.renamingSnippetId}
        renameDraft={state.renameDraft}
        onChangeRenameDraft={state.setRenameDraft}
        onBeginRenameSnippet={state.beginRenameSnippet}
        onCancelRenameSnippet={state.cancelRenameSnippet}
        onInsertTableName={(schema, table) => state.insertIntoEditor(`${schema}.${table}`)}
        onInsertColumnName={state.insertIntoEditor}
        formatTime={formatTime}
        onWidthResizerMouseDown={handleWidthResizerMouseDown}
      />

      <SettingsPanel />

      <main className={styles.layoutMain}>
        <div className={styles.editorPanelHeader}>
          <div className={styles.editorTitle}>SQL Editor</div>
          <div className={styles.editorHeaderRight}>
            <button className="btn small" onClick={() => state.createQueryTab()}>
              New
            </button>
            <span className={`${styles.statusPill} ${styles[state.status.tone] || ''}`}>
              {state.status.text}
            </span>
            <select value={state.connectionName} onChange={(e) => state.setConnectionName(e.target.value)}>
              {state.connections.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                  {c.readOnly ? ' (read-only)' : ''}
                </option>
              ))}
            </select>
            <SettingsButton section="connections" label="Settings" />
          </div>
        </div>

        <SqlTabsBar
          queryTabs={state.queryTabs}
          activeQueryTabId={state.activeQueryTabId}
          onSelectTab={state.setActiveQueryTabId}
          onRenameTab={(tabId) => {
            const tab = state.queryTabs.find((item) => item.id === tabId)
            if (!tab) return
            setTabRenameState({ tabId, title: tab.title })
          }}
          onCloseTab={state.closeTab}
        />

        <div className={styles.editorPanelBody} ref={editorPanelBodyRef}>
          <EditorPane
            tabId={state.activeQueryTabId}
            value={state.activeQueryTab?.query || ''}
            onChangeValue={(value) => state.setActiveTabQuery(value)}
            onPersistTabQuery={(tabId, value) => state.setTabQuery(tabId, value)}
            onMountEditor={state.setEditorRef}
            onSelectionChange={state.setHasSelection}
            onRunQuery={() => {
              void state.runCurrentQuery()
            }}
            onExplainQuery={() => {
              void state.runExplainQuery()
            }}
            onSaveSnippet={() => {
              openSaveSnippetDialog(false)
            }}
            schemaTablesRef={state.schemaTablesRef}
            tableColumnsByKeyRef={state.tableColumnsByKeyRef}
            ensureColumnsForTable={state.ensureColumnsForTable}
          />

          <div
            className={`${styles.editorSplitter} ${isResizing ? styles.active : ''}`.trim()}
            role="separator"
            aria-label="Resize editor and results panels"
            aria-orientation="horizontal"
            onMouseDown={startResize}
          />

          <ErrorBoundary fallbackTitle="Failed to render query results">
            <SqlResultsPanel
              result={state.result}
              formatCell={formatCell}
              connectionName={state.connectionName}
              style={{ flexBasis: `${resultsHeight}px` }}
            />
          </ErrorBoundary>

          <div className={styles.editorFooter} ref={editorFooterRef}>
            <button
              className="btn"
              disabled={state.running || state.explaining}
              onClick={() => void state.runExplainQuery()}
            >
              {state.explaining ? 'Explaining...' : 'Explain'}
            </button>
            <button
              className="btn primary"
              disabled={state.running || state.explaining}
              onClick={() => void state.runCurrentQuery()}
            >
              {state.running ? 'Running...' : state.runLabel}
            </button>
          </div>
        </div>
      </main>
      <QuickActionsDialog
        open={showQuickActions}
        items={quickActionItems}
        onClose={() => setShowQuickActions(false)}
      />
      <PromptDialog
        open={Boolean(tabRenameState)}
        title="Rename tab"
        label="Tab name"
        value={tabRenameState?.title || ''}
        placeholder="Query name"
        submitLabel="Rename"
        onClose={() => setTabRenameState(null)}
        onChange={(value) =>
          setTabRenameState((current) => (current ? { ...current, title: value } : current))
        }
        onSubmit={() => {
          if (!tabRenameState) return
          state.renameTab(tabRenameState.tabId, tabRenameState.title)
          setTabRenameState(null)
        }}
      />
      <PromptDialog
        open={Boolean(saveSnippetState)}
        title={saveSnippetState?.forceCreate ? 'Save snippet as' : 'Save snippet'}
        label="Snippet name"
        value={saveSnippetState?.title || ''}
        placeholder="Snippet name"
        hint={state.connectionName ? `Saved under connection ${state.connectionName}.` : undefined}
        submitLabel={saveSnippetState?.forceCreate ? 'Save as' : 'Save'}
        onClose={() => setSaveSnippetState(null)}
        onChange={(value) =>
          setSaveSnippetState((current) => (current ? { ...current, title: value } : current))
        }
        onSubmit={submitSaveSnippetDialog}
      />
      <PromptDialog
        open={Boolean(duplicateSnippetItem && duplicateSnippetState)}
        title="Duplicate snippet"
        label="New snippet name"
        value={duplicateSnippetState?.title || ''}
        placeholder="Snippet copy name"
        submitLabel="Duplicate"
        onClose={() => setDuplicateSnippetState(null)}
        onChange={(value) =>
          setDuplicateSnippetState((current) => (current ? { ...current, title: value } : current))
        }
        onSubmit={() => {
          if (!duplicateSnippetItem || !duplicateSnippetState) return
          void state.duplicateSnippet(duplicateSnippetItem, duplicateSnippetState.title)
          setDuplicateSnippetState(null)
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteSnippetItem)}
        title="Delete snippet"
        message={
          deleteSnippetItem ? `Delete snippet "${deleteSnippetItem.title}"? This cannot be undone.` : ''
        }
        confirmLabel="Delete"
        confirmTone="danger"
        onClose={() => setDeleteSnippetId(null)}
        onConfirm={() => {
          if (!deleteSnippetItem) return
          void state.deleteSnippet(deleteSnippetItem)
          setDeleteSnippetId(null)
        }}
      />
    </div>
  )
}
