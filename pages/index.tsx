import { useState } from 'react'
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

  return (
    <div className="layout-root">
      <SqlSidebar
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
