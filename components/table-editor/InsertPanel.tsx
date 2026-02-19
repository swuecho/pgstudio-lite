type InsertPanelProps = {
  newRowJson: string
  onChangeNewRowJson: (value: string) => void
  onInsertRow: () => void
}

export function InsertPanel({ newRowJson, onChangeNewRowJson, onInsertRow }: InsertPanelProps) {
  return (
    <div className="insert-panel">
      <div className="nav-title">Insert Row (JSON)</div>
      <textarea value={newRowJson} onChange={(e) => onChangeNewRowJson(e.target.value)} />
      <button className="btn primary" onClick={onInsertRow}>
        Insert
      </button>
    </div>
  )
}
