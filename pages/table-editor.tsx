import { useRef, useState } from 'react'
import { RelationKindBadge } from '../components/shared/RelationKindBadge'
import { SettingsPanel } from '../components/settings/SettingsPanel'
import { SettingsButton } from '../components/settings/SettingsButton'
import { ErrorBoundary } from '../components/shared/ErrorBoundary'
import { TableGridPanel } from '../components/table-editor/GridPanel'
import { SaveViewPopover } from '../components/table-editor/SaveViewPopover'
import { TableSidebar } from '../components/table-editor/Sidebar'
import { useTableEditorState } from '../components/table-editor/useTableEditorState'
import { useTableEditorUrlSync } from '../components/table-editor/useTableEditorUrlSync'
import { useSidebarResizer } from '../hooks/useSidebarResizer'
import pageStyles from './TableEditorPage.module.css'
import tableStyles from '../components/table-editor/TableEditorStyles.module.css'

export default function TableEditorPage() {
  const state = useTableEditorState()
  const { sidebarWidth, handleWidthResizerMouseDown } = useSidebarResizer()
  const filterValueInputRef = useRef<HTMLInputElement>(null)

  const [sidebarNavTab, setSidebarNavTab] = useState<'tables' | 'views'>('tables')

  const sidebarProps = state.getSidebarProps({
    activeNavTab: sidebarNavTab,
    onChangeNavTab: setSidebarNavTab,
  })
  const gridProps = state.getGridProps(filterValueInputRef)

  useTableEditorUrlSync({
    connectionName: state.connectionName,
    activeTable: state.activeTable,
    filterColumn: state.filterColumn,
    filterValue: state.filterValue,
    filterValueEnd: state.filterValueEnd,
    filterMode: state.filterMode,
    setConnectionName: state.setConnectionName,
    setActiveTable: state.setActiveTable,
    applyTableNavigation: state.applyTableNavigation,
  })

  return (
    <div
      className={pageStyles.layoutRoot}
      style={{ gridTemplateColumns: `52px ${sidebarWidth}px minmax(0, 1fr)` }}
    >
      <TableSidebar {...sidebarProps} onWidthResizerMouseDown={handleWidthResizerMouseDown} />

      <SettingsPanel />

      <main className={pageStyles.layoutMain}>
        <div className={`${pageStyles.editorPanelHeader} ${tableStyles.tableMainHeader}`}>
          <div className={tableStyles.tableHeaderTitle}>
            <div className={pageStyles.editorTitle}>Table Editor</div>
            <code className={tableStyles.tableHeaderTable}>{state.activeTable || 'No table selected'}</code>
            {state.filterSummary ? (
              <span className={tableStyles.tableHeaderFilterChip} title={state.filterSummary}>
                {state.filterSummary}
              </span>
            ) : null}
            {state.activeRelation ? <RelationKindBadge kind={state.activeRelation.kind} /> : null}
            {state.currentView ? (
              <SaveViewPopover
                currentView={state.currentView}
                onSave={state.saveBookmark}
                onSaved={() => setSidebarNavTab('views')}
              />
            ) : null}
          </div>
          <div className={pageStyles.editorHeaderRight}>
            {state.connectionReadOnly ? (
              <span className={pageStyles.readonlyPill}>Read-only connection</span>
            ) : null}
            {state.rowMutationsReadOnly && state.activeRelation && state.activeRelation.kind !== 'table' ? (
              <span className={pageStyles.readonlyPill}>View (read-only)</span>
            ) : null}
            <span className={pageStyles.statusPill}>{state.status}</span>
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

        <ErrorBoundary fallbackTitle="Failed to render table grid">
          <TableGridPanel {...gridProps} />
        </ErrorBoundary>
      </main>
    </div>
  )
}
