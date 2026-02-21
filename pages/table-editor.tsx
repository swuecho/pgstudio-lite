import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { ConnectionManagerModal } from '../components/connections/ConnectionManagerModal'
import ThemeToggle from '../components/theme-toggle'
import { TableGridPanel } from '../components/table-editor/GridPanel'
import { TableSidebar } from '../components/table-editor/Sidebar'
import { useTableEditorState } from '../components/table-editor/useTableEditorState'

export default function TableEditorPage() {
  const router = useRouter()
  const state = useTableEditorState()
  const [managingConnections, setManagingConnections] = useState(false)
  const filterValueInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!router.isReady) return
    const takeFirst = (value: string | string[] | undefined) => {
      if (!value) return ''
      return Array.isArray(value) ? value[0] || '' : value
    }

    const nextConnectionName = takeFirst(router.query.connectionName)
    const nextSchema = takeFirst(router.query.schema) || 'public'
    const nextTable = takeFirst(router.query.table)

    if (nextConnectionName) state.setConnectionName(nextConnectionName)
    if (nextTable) {
      state.setActiveTable(`${nextSchema}.${nextTable}`)
      state.setPage(0)
    }
  }, [router.isReady, router.query.connectionName, router.query.schema, router.query.table, state.setActiveTable, state.setConnectionName, state.setPage])

  useEffect(() => {
    if (!router.isReady) return
    const takeFirst = (value: string | string[] | undefined) => {
      if (!value) return ''
      return Array.isArray(value) ? value[0] || '' : value
    }

    const [schema = 'public', ...tableParts] = state.activeTable.split('.')
    const table = tableParts.join('.')
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
        connections={state.connections}
        connectionName={state.connectionName}
        onChangeConnection={state.setConnectionName}
        onOpenConnectionManager={() => setManagingConnections(true)}
        tables={state.tables}
        loadingTables={state.loadingTables}
        activeTable={state.activeTable}
        onSelectTable={state.setActiveTable}
        onRefreshTables={() => {
          void state.loadTables()
        }}
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
            <code className="table-header-table">{state.activeTable || '-'}</code>
          </div>
          <div className="editor-header-right">
            {state.connectionReadOnly ? <span className="pill">Read-only connection</span> : null}
            <span className="status-pill">{state.status}</span>
            <ThemeToggle />
          </div>
        </div>

        <div className="table-page">
          <TableGridPanel
            columns={state.columns}
            rows={state.rows}
            editableColumns={state.editableColumns}
            sortBy={state.sortBy}
            sortOrder={state.sortOrder}
            filterColumn={state.filterColumn}
            filterMode={state.filterMode}
            filterValue={state.filterValue}
            filterValueInputRef={filterValueInputRef}
            pageSize={state.pageSize}
            page={state.page}
            totalRows={state.totalRows}
            readOnlyConnection={state.connectionReadOnly}
            onChangeSortBy={state.setSortBy}
            onChangeSortOrder={state.setSortOrder}
            onChangeFilterColumn={state.setFilterColumn}
            onChangeFilterMode={state.setFilterMode}
            onChangeFilterValue={state.setFilterValue}
            onClearFilters={() => {
              state.setFilterColumn('')
              state.setFilterMode('contains')
              state.setFilterValue('')
              state.setPage(0)
            }}
            onChangePageSize={state.setPageSize}
            onUpdateCell={(ctid, column, value) => {
              void state.updateCell(ctid, column, value)
            }}
            onDeleteRow={(ctid) => {
              void state.deleteRow(ctid)
            }}
            onPrevPage={() => state.setPage((p) => Math.max(0, p - 1))}
            onNextPage={() => state.setPage((p) => p + 1)}
          />
        </div>
      </main>
    </div>
  )
}
