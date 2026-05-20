import { useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { RelationKindBadge } from '../components/shared/RelationKindBadge'
import { SettingsPanel } from '../components/settings/SettingsPanel'
import { SettingsButton } from '../components/settings/SettingsButton'
import { ErrorBoundary } from '../components/shared/ErrorBoundary'
import { TableGridPanel } from '../components/table-editor/GridPanel'
import { TableSidebar } from '../components/table-editor/Sidebar'
import { parseActiveTableKey } from '../components/table-editor/tableEditorContracts'
import { useTableEditorState } from '../components/table-editor/useTableEditorState'
import { useSidebarResizer } from '../hooks/useSidebarResizer'
import { parseFilterMode } from '../lib/table-filter'
import { getColumnKind } from '../lib/table-column-kind'
import pageStyles from './TableEditorPage.module.css'
import tableStyles from '../components/table-editor/TableEditorStyles.module.css'

export default function TableEditorPage() {
  const router = useRouter()
  const state = useTableEditorState()
  const { sidebarWidth, handleWidthResizerMouseDown } = useSidebarResizer()
  const filterValueInputRef = useRef<HTMLInputElement>(null)
  const didInitUrlSyncRef = useRef(false)
  const sidebarProps = state.getSidebarProps()
  const gridProps = state.getGridProps(filterValueInputRef)

  const takeFirst = (value: string | string[] | undefined) => {
    if (!value) return ''
    return Array.isArray(value) ? value[0] || '' : value
  }

  useEffect(() => {
    if (!router.isReady) return

    const nextConnectionName = takeFirst(router.query.connectionName)
    const nextSchema = takeFirst(router.query.schema) || 'public'
    const nextTable = takeFirst(router.query.table)
    const nextActiveTable = nextTable ? `${nextSchema}.${nextTable}` : ''
    const nextFilterColumn = takeFirst(router.query.filterColumn)
    const nextFilterValue = takeFirst(router.query.filterValue)
    const nextFilterValueEnd = takeFirst(router.query.filterValueEnd)
    const nextFilterMode = takeFirst(router.query.filterMode)

    if (nextConnectionName && nextConnectionName !== state.connectionName) {
      state.setConnectionName(nextConnectionName)
      if (state.activeTable) {
        state.setActiveTable('')
      }
    }
    if (nextActiveTable !== state.activeTable) {
      state.setActiveTable(nextActiveTable)
      state.setPage(0)
    }
    if (nextFilterColumn !== state.filterColumn) {
      state.setFilterColumn(nextFilterColumn)
    }
    if (nextFilterValue !== state.filterValue) {
      state.setFilterValue(nextFilterValue)
    }
    if (nextFilterValueEnd !== state.filterValueEnd) {
      state.setFilterValueEnd(nextFilterValueEnd)
    }
    if (nextFilterMode) {
      state.setFilterMode(parseFilterMode(nextFilterMode, getColumnKind('text')))
    }
    didInitUrlSyncRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    router.isReady,
    router.query.connectionName,
    router.query.schema,
    router.query.table,
    router.query.filterColumn,
    router.query.filterValue,
    router.query.filterValueEnd,
    router.query.filterMode,
    state.setActiveTable,
    state.setConnectionName,
    state.setFilterColumn,
    state.setFilterMode,
    state.setFilterValue,
    state.setFilterValueEnd,
    state.setPage,
  ])

  useEffect(() => {
    if (!router.isReady || !didInitUrlSyncRef.current) return

    const parsedTarget = parseActiveTableKey(state.activeTable)
    const table = parsedTarget.table
    const schema = parsedTarget.schema
    const currentConnection = takeFirst(router.query.connectionName)
    const currentSchema = takeFirst(router.query.schema)
    const currentTable = takeFirst(router.query.table)
    const currentFilterColumn = takeFirst(router.query.filterColumn)
    const currentFilterValue = takeFirst(router.query.filterValue)
    const currentFilterValueEnd = takeFirst(router.query.filterValueEnd)
    const currentFilterMode = takeFirst(router.query.filterMode)

    const nextConnection = state.connectionName || ''
    const nextSchema = table ? schema : ''
    const nextTable = table || ''
    const nextFilterColumn = state.filterColumn || ''
    const nextFilterValue = state.filterValue.trim()
    const nextFilterValueEnd = state.filterValueEnd.trim()
    const nextFilterMode = state.filterColumn ? state.filterMode : ''

    if (
      currentConnection === nextConnection &&
      currentSchema === nextSchema &&
      currentTable === nextTable &&
      currentFilterColumn === nextFilterColumn &&
      currentFilterValue === nextFilterValue &&
      currentFilterValueEnd === nextFilterValueEnd &&
      currentFilterMode === nextFilterMode
    ) {
      return
    }

    const nextQuery: Record<string, string> = {}
    if (nextConnection) nextQuery.connectionName = nextConnection
    if (nextSchema) nextQuery.schema = nextSchema
    if (nextTable) nextQuery.table = nextTable
    if (nextFilterColumn) nextQuery.filterColumn = nextFilterColumn
    if (nextFilterMode) nextQuery.filterMode = nextFilterMode
    if (nextFilterValue) nextQuery.filterValue = nextFilterValue
    if (nextFilterValueEnd) nextQuery.filterValueEnd = nextFilterValueEnd

    void router.replace({ pathname: '/table-editor', query: nextQuery }, undefined, { shallow: true })
  }, [
    router,
    router.isReady,
    router.query.connectionName,
    router.query.schema,
    router.query.table,
    router.query.filterColumn,
    router.query.filterValue,
    router.query.filterValueEnd,
    router.query.filterMode,
    state.activeTable,
    state.connectionName,
    state.filterColumn,
    state.filterMode,
    state.filterValue,
    state.filterValueEnd,
  ])

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
