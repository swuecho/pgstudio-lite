import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { ConnectionManagerModal } from '../components/connections/ConnectionManagerModal'
import { TableGridPanel } from '../components/table-editor/GridPanel'
import { TableSidebar } from '../components/table-editor/Sidebar'
import { parseActiveTableKey } from '../components/table-editor/tableEditorContracts'
import { useTableEditorState } from '../components/table-editor/useTableEditorState'

export default function TableEditorPage() {
  const router = useRouter()
  const state = useTableEditorState()
  const [managingConnections, setManagingConnections] = useState(false)
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
    <div className="layout-root">
      <TableSidebar
        {...sidebarProps}
      />

      <ConnectionManagerModal
        open={managingConnections}
        onClose={() => setManagingConnections(false)}
        connections={state.connections}
        connectionName={state.connectionName}
        onChangeConnection={state.setConnectionName}
      />

      <main className="layout-main">
        <div className="editor-panel-header table-main-header">
          <div className="table-header-title">
            <div className="editor-title">Table Editor</div>
            <code className="table-header-table">
              {state.activeTable || 'No table selected'}
            </code>
          </div>
          <div className="editor-header-right">
            {state.connectionReadOnly ? <span className="pill">Read-only connection</span> : null}
            <span className="status-pill">{state.status}</span>
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

        <div className="table-page">
          <TableGridPanel
            {...gridProps}
          />
        </div>
      </main>
    </div>
  )
}
