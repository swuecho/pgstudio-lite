import { useEffect, useRef, useState } from 'react'
import { ConnectionManagerModal } from '../components/connections/ConnectionManagerModal'
import { EditorPane } from '../components/sql-editor/EditorPane'
import { SqlResultsPanel } from '../components/sql-editor/ResultsPanel'
import { SqlSidebar } from '../components/sql-editor/Sidebar'
import { SqlTabsBar } from '../components/sql-editor/TabsBar'
import { useSqlEditorState } from '../components/sql-editor/useSqlEditorState'
import { formatCell, formatTime } from '../components/sql-editor/utils'
import ThemeToggle from '../components/theme-toggle'

export default function SqlEditorPage() {
  const state = useSqlEditorState()
  const [managingConnections, setManagingConnections] = useState(false)
  const sidebarSearchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      if (target.isContentEditable) return true
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    }

    const openQuickActions = () => {
      const choice = window
        .prompt(
          [
            'Quick Action',
            'new - New query tab',
            'run - Run current query',
            'save - Save snippet',
            'search - Focus sidebar search',
            'explorer - Open explorer tab',
            'snippets - Open snippets tab',
            'history - Open history tab',
          ].join('\n')
        )
        ?.trim()
        .toLowerCase()

      if (!choice) return
      if (choice === 'new') return state.createQueryTab()
      if (choice === 'run') return void state.runCurrentQuery()
      if (choice === 'save') return void state.saveCurrentAsSnippet()
      if (choice === 'search') {
        sidebarSearchRef.current?.focus()
        sidebarSearchRef.current?.select()
        return
      }
      if (choice === 'explorer' || choice === 'snippets' || choice === 'history') {
        state.setActiveNavTab(choice)
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === 'k') {
        event.preventDefault()
        openQuickActions()
        return
      }

      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditableTarget(event.target)) {
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
  }, [
    state.historySearch,
    state.createQueryTab,
    state.runCurrentQuery,
    state.saveCurrentAsSnippet,
    state.setActiveNavTab,
    state.setHistorySearch,
  ])

  return (
    <div className="layout-root">
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
          void state.saveCurrentAsSnippet(forceCreate)
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
          void state.duplicateSnippet(item)
        }}
        onRenameSnippet={(item, nextTitle) => {
          void state.renameSnippet(item, nextTitle)
        }}
        onDeleteSnippet={(item) => {
          void state.deleteSnippet(item)
        }}
        renamingSnippetId={state.renamingSnippetId}
        renameDraft={state.renameDraft}
        onChangeRenameDraft={state.setRenameDraft}
        onBeginRenameSnippet={state.beginRenameSnippet}
        onCancelRenameSnippet={state.cancelRenameSnippet}
        onInsertTableName={(schema, table) => state.insertIntoEditor(`${schema}.${table}`)}
        onInsertColumnName={state.insertIntoEditor}
        formatTime={formatTime}
      />

      <ConnectionManagerModal
        open={managingConnections}
        onClose={() => setManagingConnections(false)}
        connections={state.connections}
        connectionName={state.connectionName}
        onChangeConnection={state.setConnectionName}
      />

      <main className="layout-main">
        <div className="editor-panel-header">
          <div className="editor-title">SQL Editor</div>
          <div className="editor-header-right">
            <button className="btn small" onClick={() => state.createQueryTab()}>
              New
            </button>
            <span className={`status-pill ${state.status.tone}`}>{state.status.text}</span>
            <ThemeToggle />
              <select value={state.connectionName} onChange={(e) => state.setConnectionName(e.target.value)}>
                {state.connections.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                    {c.readOnly ? ' (read-only)' : ''}
                  </option>
                ))}
              </select>
            <button className="btn small" onClick={() => setManagingConnections(true)}>
              Manage
            </button>
          </div>
        </div>

        <SqlTabsBar
          queryTabs={state.queryTabs}
          activeQueryTabId={state.activeQueryTabId}
          onSelectTab={state.setActiveQueryTabId}
          onRenameTab={state.renameTab}
          onCloseTab={state.closeTab}
        />

        <div className="editor-panel-body">
          <EditorPane
            value={state.activeQueryTab?.query || ''}
            onChangeValue={(value) => state.setActiveTabQuery(value)}
            onMountEditor={state.setEditorRef}
            onSelectionChange={state.setHasSelection}
            onRunQuery={() => {
              void state.runCurrentQuery()
            }}
            onSaveSnippet={() => {
              void state.saveCurrentAsSnippet()
            }}
            schemaTablesRef={state.schemaTablesRef}
            tableColumnsByKeyRef={state.tableColumnsByKeyRef}
          />

          <SqlResultsPanel result={state.result} formatCell={formatCell} />

          <div className="editor-footer">
            <button className="btn primary" disabled={state.running} onClick={() => void state.runCurrentQuery()}>
              {state.running ? 'Running...' : state.runLabel}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
