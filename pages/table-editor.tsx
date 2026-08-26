import { useRef, useState } from 'react'
import { PageHead } from '@/components/shared/PageHead'
import { QuickActionsDialog } from '@/components/shared/Dialog'
import { CopyableCellValue } from '@/components/shared/CopyableCellValue'
import { useQuickActionsHotkey } from '@/hooks/useQuickActionsHotkey'
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
  const sidebarSearchRef = useRef<HTMLInputElement>(null)

  const [sidebarNavTab, setSidebarNavTab] = useState<'tables' | 'views'>('tables')

  const sidebarProps = state.getSidebarProps({
    activeNavTab: sidebarNavTab,
    onChangeNavTab: setSidebarNavTab,
  })
  const gridProps = state.getGridProps(filterValueInputRef)

  const quickActions = useQuickActionsHotkey({ searchRef: sidebarSearchRef })
  const quickActionItems = [
    {
      id: 'refresh-tables',
      title: 'Refresh tables',
      description: 'Reload the table and view list for this connection.',
      onSelect: () => sidebarProps.onRefreshTables(),
    },
    {
      id: 'clear-filters',
      title: 'Clear filters',
      description: 'Drop the active row filter.',
      onSelect: () => gridProps.onClearFilters(),
    },
    {
      id: 'saved-views',
      title: 'Show saved views',
      description: 'Switch the sidebar to bookmarks and recent views.',
      onSelect: () => setSidebarNavTab('views'),
    },
    {
      id: 'tables-list',
      title: 'Show tables',
      description: 'Switch the sidebar back to tables and views.',
      onSelect: () => setSidebarNavTab('tables'),
    },
  ]

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
      <TableSidebar
        {...sidebarProps}
        searchInputRef={sidebarSearchRef}
        onWidthResizerMouseDown={handleWidthResizerMouseDown}
      />

      <SettingsPanel />

      <PageHead title="Table Editor" subject={state.activeTable} />
      <QuickActionsDialog
        open={quickActions.open}
        items={quickActionItems}
        onClose={() => quickActions.setOpen(false)}
      />
      <main className={pageStyles.layoutMain}>
        <div className={`${pageStyles.editorPanelHeader} ${tableStyles.tableMainHeader}`}>
          <div className={tableStyles.tableHeaderTitle}>
            <div className={pageStyles.editorTitle}>Table Editor</div>
            {state.activeTable ? (
              <CopyableCellValue
                text={state.activeTable}
                className={tableStyles.tableHeaderTable}
                ariaLabel="Table name"
              />
            ) : (
              <code className={tableStyles.tableHeaderTable}>No table selected</code>
            )}
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
