import Link from 'next/link'
import { useState } from 'react'
import ThemeToggle from '../components/theme-toggle'
import { SettingsPanel } from '../components/settings/SettingsPanel'
import { SettingsButton } from '../components/settings/SettingsButton'
import { ConfirmDialog, PromptDialog } from '../components/shared/Dialog'
import { NotebookCellList } from '../components/notebook/NotebookCellList'
import { NotebookHelpPanel } from '../components/notebook/NotebookHelpPanel'
import { NotebookImportModal } from '../components/notebook/NotebookImportModal'
import { NotebookParameterPanel } from '../components/notebook/NotebookParameterPanel'
import { NotebookSidebar } from '../components/notebook/NotebookSidebar'
import { useNotebookPageState } from '../components/notebook/useNotebookPageState'
import { NOTEBOOK_WIDGET_PRESETS } from '../lib/notebook-widgets'
import styles from '../components/notebook/NotebookPage.module.css'

export default function NotebookPage() {
  const controller = useNotebookPageState()
  const [renameNotebookState, setRenameNotebookState] = useState<{ id: string; title: string } | null>(null)
  const [deleteNotebookState, setDeleteNotebookState] = useState<{ id: string; title: string } | null>(null)

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
          setDeleteNotebookState({ id: item.id, title: item.title })
        }}
        onRenameNotebook={(item) => {
          setRenameNotebookState({ id: item.id, title: item.title })
        }}
        onSelectNotebook={controller.setActiveNotebookId}
      />

      <main className={styles.layoutMain}>
        <div className={styles.editorPanelHeader}>
          <div className={`${styles.editorTitle} truncate`}>
            Notebook · {controller.activeNotebook?.title || '-'}
          </div>
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
            <SettingsButton section="connections" label="Settings" />
            <button
              className={`btn small ${styles.actionButton}`}
              onClick={() => controller.notebookImport.setShowImportModal(true)}
            >
              Import
            </button>
            <button
              className={`btn small ${styles.actionButton}`}
              disabled={!controller.activeNotebookId}
              onClick={controller.notebookImport.exportNotebookJson}
            >
              Export
            </button>
            <button
              className={`btn small ${styles.actionButton}`}
              onClick={() => controller.notebookImport.setShowHelp((prev) => !prev)}
            >
              {controller.notebookImport.showHelp ? 'Hide Help' : 'Help'}
            </button>
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.cellCount}>
            <span className="history-meta">
              {controller.sortedCells.length} {controller.sortedCells.length === 1 ? 'cell' : 'cells'}
            </span>
            {controller.pendingSaveCount ? (
              <span className="history-meta"> · {controller.pendingSaveCount} unsaved</span>
            ) : null}
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
            <select
              className={styles.presetSelect}
              value={controller.selectedWidgetPreset}
              disabled={!controller.activeNotebookId || controller.runningAll}
              onChange={(event) =>
                controller.setSelectedWidgetPreset(
                  event.target.value as typeof controller.selectedWidgetPreset
                )
              }
              title="Widget preset"
            >
              {NOTEBOOK_WIDGET_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <button
              className="btn small"
              disabled={!controller.activeNotebookId || controller.runningAll}
              onClick={() => controller.addWidgetPresetMutation.mutate(controller.selectedWidgetPreset)}
            >
              Add Preset
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

        <NotebookParameterPanel controller={controller} />

        <NotebookCellList controller={controller} />
      </main>

      <SettingsPanel />

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
      <PromptDialog
        open={Boolean(renameNotebookState)}
        title="Rename notebook"
        label="Notebook title"
        value={renameNotebookState?.title || ''}
        placeholder="Notebook title"
        submitLabel="Rename"
        onClose={() => setRenameNotebookState(null)}
        onChange={(value) =>
          setRenameNotebookState((current) => (current ? { ...current, title: value } : current))
        }
        onSubmit={() => {
          if (!renameNotebookState) return
          const item = controller.notebooks.find((notebook) => notebook.id === renameNotebookState.id)
          if (!item) return
          controller.renameNotebook?.(item, renameNotebookState.title.trim())
          setRenameNotebookState(null)
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteNotebookState)}
        title="Delete notebook"
        message={deleteNotebookState ? `Delete notebook "${deleteNotebookState.title}"?` : ''}
        confirmLabel="Delete"
        confirmTone="danger"
        onClose={() => setDeleteNotebookState(null)}
        onConfirm={() => {
          if (!deleteNotebookState) return
          controller.removeNotebook?.(deleteNotebookState.id)
          setDeleteNotebookState(null)
        }}
      />
    </div>
  )
}
