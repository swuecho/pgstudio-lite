import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createConnection,
  deleteConnection,
  setDefaultConnection,
  updateConnection,
} from '../../features/connections/connections.service'
import { CONNECTIONS_QUERY_KEY } from '../shared/hooks/useConnections'
import { ConfirmDialog } from '../shared/Dialog'

type ConnectionItem = {
  id?: string
  name: string
  isDefault?: boolean
  readOnly?: boolean
}

type ConnectionManagerModalProps = {
  open: boolean
  onClose: () => void
  connections: ConnectionItem[]
  connectionName: string
  onChangeConnection: (name: string) => void
}

export function ConnectionManagerModal({
  open,
  onClose,
  connections,
  connectionName,
  onChangeConnection,
}: ConnectionManagerModalProps) {
  const queryClient = useQueryClient()
  const [errorText, setErrorText] = useState('')
  const [newName, setNewName] = useState('')
  const [newConnectionString, setNewConnectionString] = useState('')
  const [newIsDefault, setNewIsDefault] = useState(false)
  const [newReadOnly, setNewReadOnly] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editConnectionString, setEditConnectionString] = useState('')
  const [editIsDefault, setEditIsDefault] = useState(false)
  const [editReadOnly, setEditReadOnly] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const sortedConnections = useMemo(
    () =>
      [...connections].sort((a, b) => {
        if ((a.isDefault ? 1 : 0) !== (b.isDefault ? 1 : 0)) return a.isDefault ? -1 : 1
        return a.name.localeCompare(b.name)
      }),
    [connections]
  )

  async function invalidateConnectionQueries() {
    await queryClient.invalidateQueries({ queryKey: CONNECTIONS_QUERY_KEY })
  }

  const createMutation = useMutation({
    mutationFn: createConnection,
    onSuccess: async ({ item }) => {
      await invalidateConnectionQueries()
      if (item.isDefault || connections.length === 0) onChangeConnection(item.name)
      setNewName('')
      setNewConnectionString('')
      setNewIsDefault(false)
      setNewReadOnly(false)
      setErrorText('')
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'Failed to create connection'),
  })

  const updateMutation = useMutation({
    mutationFn: updateConnection,
    onSuccess: async ({ item }) => {
      await invalidateConnectionQueries()
      if (editingId) {
        const current = connections.find((connection) => connection.id === editingId)
        if (current?.name === connectionName || item.isDefault) onChangeConnection(item.name)
      }
      setEditingId(null)
      setEditName('')
      setEditConnectionString('')
      setEditIsDefault(false)
      setEditReadOnly(false)
      setErrorText('')
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'Failed to update connection'),
  })

  const setDefaultMutation = useMutation({
    mutationFn: setDefaultConnection,
    onSuccess: async ({ item }) => {
      await invalidateConnectionQueries()
      onChangeConnection(item.name)
      setErrorText('')
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'Failed to set default connection'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteConnection,
    onSuccess: async (_result, id) => {
      const deleted = connections.find((connection) => connection.id === id)
      await invalidateConnectionQueries()
      if (deleted?.name === connectionName) {
        const fallback = sortedConnections.find((connection) => connection.id !== id)
        if (fallback) onChangeConnection(fallback.name)
      }
      setErrorText('')
      if (editingId === id) setEditingId(null)
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'Failed to delete connection'),
  })

  if (!open) return null

  const pendingDeleteConnection = sortedConnections.find((connection) => connection.id === pendingDeleteId) || null

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    setDefaultMutation.isPending ||
    deleteMutation.isPending

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head">
          <div className="nav-title">Manage Connections</div>
          <button className="btn small" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="modal-body">
          {errorText ? <div className="modal-error">{errorText}</div> : null}

          <div className="modal-section">
            <div className="history-meta">Configured connections</div>
            <div className="modal-list">
              {sortedConnections.map((connection) => (
                <div key={connection.id || connection.name} className="modal-row">
                  <div className="modal-row-main">
                    <div className="history-query">{connection.name}</div>
                    {connection.isDefault ? <span className="pill ok">default</span> : null}
                    {connection.readOnly ? <span className="pill">read-only</span> : null}
                  </div>
                  <div className="history-actions">
                    <button
                      className="btn small"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(connection.id || null)
                        setEditName(connection.name)
                        setEditConnectionString('')
                        setEditIsDefault(Boolean(connection.isDefault))
                        setEditReadOnly(Boolean(connection.readOnly))
                      }}
                    >
                      Edit
                    </button>
                    {!connection.isDefault ? (
                      <button
                        className="btn small"
                        disabled={!connection.id || busy}
                        onClick={() => connection.id && setDefaultMutation.mutate(connection.id)}
                      >
                        Set default
                      </button>
                    ) : null}
                    <button
                      className="btn small danger"
                      disabled={!connection.id || busy || connections.length <= 1}
                      onClick={() => {
                        if (!connection.id) return
                        setPendingDeleteId(connection.id)
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {editingId ? (
            <div className="modal-section">
              <div className="history-meta">Edit connection</div>
              <div className="modal-form-grid">
                <input
                  placeholder="Connection name"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                />
                <input
                  placeholder="Connection string (leave blank to keep current)"
                  value={editConnectionString}
                  onChange={(event) => setEditConnectionString(event.target.value)}
                />
                <label className="modal-check">
                  <input
                    type="checkbox"
                    checked={editIsDefault}
                    onChange={(event) => setEditIsDefault(event.target.checked)}
                  />
                  Set as default
                </label>
                <label className="modal-check">
                  <input
                    type="checkbox"
                    checked={editReadOnly}
                    onChange={(event) => setEditReadOnly(event.target.checked)}
                  />
                  Read-only mode
                </label>
                <div className="history-actions">
                  <button
                    className="btn small"
                    disabled={busy || !editingId || !editName.trim()}
                    onClick={() =>
                      editingId &&
                      updateMutation.mutate({
                        id: editingId,
                        name: editName.trim(),
                        connectionString: editConnectionString.trim() || undefined,
                        isDefault: editIsDefault,
                        readOnly: editReadOnly,
                      })
                    }
                  >
                    Save
                  </button>
                  <button
                    className="btn small"
                    disabled={busy}
                    onClick={() => {
                      setEditingId(null)
                      setEditName('')
                      setEditConnectionString('')
                      setEditIsDefault(false)
                      setEditReadOnly(false)
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="modal-section">
            <div className="history-meta">Add new connection</div>
            <div className="modal-form-grid">
              <input
                placeholder="Connection name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
              <input
                placeholder="postgres://user:password@host:5432/db"
                value={newConnectionString}
                onChange={(event) => setNewConnectionString(event.target.value)}
              />
              <label className="modal-check">
                <input
                  type="checkbox"
                  checked={newIsDefault}
                  onChange={(event) => setNewIsDefault(event.target.checked)}
                />
                Set as default
              </label>
              <label className="modal-check">
                <input
                  type="checkbox"
                  checked={newReadOnly}
                  onChange={(event) => setNewReadOnly(event.target.checked)}
                />
                Read-only mode
              </label>
              <div className="history-actions">
                <button
                  className="btn small primary"
                  disabled={busy || !newName.trim() || !newConnectionString.trim()}
                  onClick={() =>
                    createMutation.mutate({
                      name: newName.trim(),
                      connectionString: newConnectionString.trim(),
                      isDefault: newIsDefault,
                      readOnly: newReadOnly,
                    })
                  }
                >
                  Add connection
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(pendingDeleteConnection)}
        title="Delete connection"
        message={
          pendingDeleteConnection
            ? `Delete connection "${pendingDeleteConnection.name}"? Existing saved snippets and notebooks will keep their connection name, so switch them manually if needed.`
            : ''
        }
        confirmLabel="Delete"
        confirmTone="danger"
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => {
          if (!pendingDeleteConnection?.id) return
          deleteMutation.mutate(pendingDeleteConnection.id)
          setPendingDeleteId(null)
        }}
      />
    </div>
  )
}
