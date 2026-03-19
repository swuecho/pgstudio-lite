import Link from 'next/link'
import ThemeToggle from '../components/theme-toggle'
import { NotebookCellList } from '../components/notebook/NotebookCellList'
import { NotebookHelpPanel } from '../components/notebook/NotebookHelpPanel'
import { NotebookImportModal } from '../components/notebook/NotebookImportModal'
import { NotebookSidebar } from '../components/notebook/NotebookSidebar'
import { useNotebookPageState } from '../components/notebook/useNotebookPageState'
import styles from '../components/notebook/NotebookPage.module.css'

export default function NotebookPage() {
  const controller = useNotebookPageState()

  return (
    <div
      className={styles.layoutRoot}
      style={{ gridTemplateColumns: `52px ${controller.sidebarWidth}px minmax(0, 1fr)` }}
    >
      <aside className={styles.layoutRail}>
        <Link className={`${styles.railBtn} ${styles.linkBtn}`} href="/">
          SQL
        </Link>
        <Link className={`${styles.railBtn} ${styles.linkBtn}`} href="/table-editor">
          TB
        </Link>
        <button className={`${styles.railBtn} ${styles.active}`}>NB</button>
        <div className="mt-auto flex justify-center">
          <ThemeToggle />
        </div>
      </aside>

      <NotebookSidebar
        activeNotebookId={controller.activeNotebookId}
        handleWidthResizerMouseDown={controller.handleWidthResizerMouseDown}
        notebookSearch={controller.notebookSearch}
        notebooks={controller.notebooks}
        onChangeNotebookSearch={controller.setNotebookSearch}
        onCreateNotebook={() => controller.createNotebookMutation.mutate()}
        onDeleteNotebook={(item) => {
          if (!window.confirm(`Delete notebook '${item.title}'?`)) return
          controller.removeNotebook?.(item.id)
        }}
        onRenameNotebook={(item) => {
          const nextTitle = window.prompt('Rename notebook', item.title)
          if (!nextTitle || !nextTitle.trim()) return
          controller.renameNotebook?.(item, nextTitle.trim())
        }}
        onSelectNotebook={controller.setActiveNotebookId}
      />

      <main className={styles.layoutMain}>
        <div className={styles.editorPanelHeader}>
          <div className={`${styles.editorTitle} truncate`}>Notebook · {controller.activeNotebook?.title || '-'}</div>
          <div className={`${styles.editorHeaderRight} ${styles.headerActions}`}>
            <span className={`status-pill ${styles.statusPill}`}>{controller.status}</span>
            <select
              className={styles.connectionSelect}
              value={controller.activeNotebook?.connection_name || ''}
              onChange={(event) => {
                controller.updateNotebookConnection(event.target.value)
              }}
            >
              {controller.connections.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                  {c.readOnly ? ' (read-only)' : ''}
                </option>
              ))}
            </select>
            <button className={`btn small ${styles.actionButton}`} onClick={() => controller.notebookImport.setShowImportModal(true)}>
              Import
            </button>
            <button
              className={`btn small ${styles.actionButton}`}
              disabled={!controller.activeNotebookId}
              onClick={controller.notebookImport.exportNotebookJson}
            >
              Export
            </button>
            <button className={`btn small ${styles.actionButton}`} onClick={() => controller.notebookImport.setShowHelp((prev) => !prev)}>
              {controller.notebookImport.showHelp ? 'Hide Help' : 'Help'}
            </button>
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.cellCount}>
            <span className="history-meta">
              {controller.sortedCells.length} {controller.sortedCells.length === 1 ? 'cell' : 'cells'}
            </span>
          </div>
          <div className={styles.toolbarActions}>
            <button
              className="btn small"
              disabled={!controller.activeNotebookId || controller.runningAll}
              onClick={() => controller.addCellMutation.mutate('sql')}
            >
              Add SQL
            </button>
            <button
              className="btn small"
              disabled={!controller.activeNotebookId || controller.runningAll}
              onClick={() => controller.addCellMutation.mutate('markdown')}
            >
              Add Markdown
            </button>
            <button
              className="btn small"
              disabled={!controller.activeNotebookId || controller.runningAll}
              onClick={() => controller.addCellMutation.mutate('widget')}
            >
              Add Widget
            </button>
            <button
              className="btn small primary"
              disabled={!controller.activeNotebookId || controller.runningAll}
              onClick={() => void controller.runAllSqlCells()}
            >
              {controller.runningAll ? 'Running All...' : 'Run All'}
            </button>
          </div>
        </div>

        {controller.notebookImport.showHelp ? (
          <NotebookHelpPanel
            promptTask={controller.notebookImport.promptTask}
            setPromptTask={controller.notebookImport.setPromptTask}
            promptDbContext={controller.notebookImport.promptDbContext}
            setPromptDbContext={controller.notebookImport.setPromptDbContext}
            promptStyle={controller.notebookImport.promptStyle}
            setPromptStyle={controller.notebookImport.setPromptStyle}
            promptPatchTask={controller.notebookImport.promptPatchTask}
            setPromptPatchTask={controller.notebookImport.setPromptPatchTask}
            copyGeneratePrompt={controller.notebookImport.copyGeneratePrompt}
            copyPatchPromptPrefilled={controller.notebookImport.copyPatchPromptPrefilled}
            copyHelpApiSnippet={controller.notebookImport.copyHelpApiSnippet}
          />
        ) : null}

        <div className={styles.cells}>
          <NotebookCellList controller={controller} />
        </div>
      </main>

      {controller.notebookImport.showImportModal ? (
        <NotebookImportModal
          importMode={controller.notebookImport.importMode}
          setImportMode={controller.notebookImport.setImportMode}
          importRawJson={controller.notebookImport.importRawJson}
          setImportRawJson={controller.notebookImport.setImportRawJson}
          isImporting={controller.notebookImport.isImporting}
          isValidating={controller.notebookImport.isValidating}
          importParseHint={controller.notebookImport.importParseHint}
          importValidationSnapshot={controller.notebookImport.importValidationSnapshot}
          importValidationWarnings={controller.notebookImport.importValidationWarnings}
          importDiffSummary={controller.notebookImport.importDiffSummary}
          importErrorDetails={controller.notebookImport.importErrorDetails}
          canUseCurrentJson={Boolean(controller.activeNotebookId)}
          onClose={() => controller.notebookImport.setShowImportModal(false)}
          onPaste={controller.notebookImport.pasteImportJsonFromClipboard}
          onFormatJson={controller.notebookImport.formatImportJson}
          onValidate={controller.notebookImport.validateImportDraft}
          onPreviewDiff={controller.notebookImport.previewImportDiff}
          onUseCurrentJson={controller.notebookImport.loadCurrentNotebookJson}
          onImport={controller.notebookImport.submitImportFromModal}
        />
      ) : null}
    </div>
  )
}
