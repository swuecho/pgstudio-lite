type InsertPanelProps = {
  newRowJson: string
  readOnlyConnection: boolean
  onChangeNewRowJson: (value: string) => void
  onInsertRow: () => void
}

export function InsertPanel({ newRowJson, readOnlyConnection, onChangeNewRowJson, onInsertRow }: InsertPanelProps) {
  return (
    <div className="insert-panel">
      <div className="nav-title">Insert Row (JSON)</div>
      <textarea
        value={newRowJson}
        disabled={readOnlyConnection}
        onChange={(e) => onChangeNewRowJson(e.target.value)}
      />
      <button className="btn primary" disabled={readOnlyConnection} onClick={onInsertRow}>
        Insert
      </button>
    </div>
  )
}
