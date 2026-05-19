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

    if (nextConnectionName && nextConnectionName !== state.connectionName) {
      state.setConnectionName(nextConnectionName)
      // Clear activeTable when connection changes to avoid showing stale table names
      if (state.activeTable) {
        state.setActiveTable('')
      }
    }
    // Always sync activeTable with URL (including clearing when empty)
    if (nextActiveTable !== state.activeTable) {
      state.setActiveTable(nextActiveTable)
      state.setPage(0)
    }
    didInitUrlSyncRef.current = true
    // Don't include state.activeTable in deps - only track URL changes to avoid infinite loop
  }, [router.isReady, router.query.connectionName, router.query.schema, router.query.table, state.setActiveTable, state.setConnectionName, state.setPage])

  useEffect(() => {
    if (!router.isReady || !didInitUrlSyncRef.current) return

    const parsedTarget = parseActiveTableKey(state.activeTable)
    const table = parsedTarget.table
    const schema = parsedTarget.schema
    const currentConnection = takeFirst(router.query.connectionName)
    const currentSchema = takeFirst(router.query.schema)
    const currentTable = takeFirst(router.query.table)

    const nextConnection = state.connectionName || ''
    const nextSchema = table ? schema : ''
    const nextTable = table || ''

    if (
      currentConnection === nextConnection &&
      currentSchema === nextSchema &&
      currentTable === nextTable
    ) {
      return
    }

    const nextQuery: Record<string, string> = {}
    if (nextConnection) nextQuery.connectionName = nextConnection
    if (nextSchema) nextQuery.schema = nextSchema
    if (nextTable) nextQuery.table = nextTable

    void router.replace({ pathname: '/table-editor', query: nextQuery }, undefined, { shallow: true })
  }, [router, router.isReady, router.query.connectionName, router.query.schema, router.query.table, state.activeTable, state.connectionName])

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      if (target.isContentEditable) return true
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditableTarget(event.target)) {
        event.preventDefault()
        filterValueInputRef.current?.focus()
        filterValueInputRef.current?.select()
        return
      }

      if (event.key === 'Escape' && document.activeElement === filterValueInputRef.current) {
        if (state.filterValue) {
          state.setFilterValue('')
          state.setPage(0)
        } else {
          filterValueInputRef.current?.blur()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [state.filterValue, state.setFilterValue, state.setPage])

  return (
    <div className={pageStyles.layoutRoot} style={{ gridTemplateColumns: `52px ${sidebarWidth}px minmax(0, 1fr)` }}>
      <TableSidebar
        {...sidebarProps}
        onWidthResizerMouseDown={handleWidthResizerMouseDown}
      />

      <SettingsPanel />

      <main className={pageStyles.layoutMain}>
        <div className={`${pageStyles.editorPanelHeader} ${tableStyles.tableMainHeader}`}>
          <div className={tableStyles.tableHeaderTitle}>
            <div className={pageStyles.editorTitle}>Table Editor</div>
            <code className={tableStyles.tableHeaderTable}>
              {state.activeTable || 'No table selected'}
            </code>
            {state.activeRelation ? <RelationKindBadge kind={state.activeRelation.kind} /> : null}
          </div>
          <div className={pageStyles.editorHeaderRight}>
            {state.connectionReadOnly ? <span className={pageStyles.readonlyPill}>Read-only connection</span> : null}
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

        <div className={tableStyles.tablePage}>
          <ErrorBoundary fallbackTitle="Failed to render table grid">
            <TableGridPanel
              {...gridProps}
            />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  )
}
