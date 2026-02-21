import { useState } from 'react'
import { ConnectionManagerModal } from '../components/connections/ConnectionManagerModal'
import ThemeToggle from '../components/theme-toggle'
import { TableGridPanel } from '../components/table-editor/GridPanel'
import { TableSidebar } from '../components/table-editor/Sidebar'
import { useTableEditorState } from '../components/table-editor/useTableEditorState'

export default function TableEditorPage() {
  const state = useTableEditorState()
  const [managingConnections, setManagingConnections] = useState(false)

  return (
    <div className="layout-root">
      <TableSidebar
        connections={state.connections}
        connectionName={state.connectionName}
        onChangeConnection={state.setConnectionName}
        onOpenConnectionManager={() => setManagingConnections(true)}
        tables={state.tables}
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
        <div className="editor-panel-header">
          <div className="editor-title">Table Editor · {state.activeTable || '-'}</div>
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
            pageSize={state.pageSize}
            page={state.page}
            totalRows={state.totalRows}
            readOnlyConnection={state.connectionReadOnly}
            onChangeSortBy={state.setSortBy}
            onChangeSortOrder={state.setSortOrder}
            onChangeFilterColumn={state.setFilterColumn}
            onChangeFilterMode={state.setFilterMode}
            onChangeFilterValue={state.setFilterValue}
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
