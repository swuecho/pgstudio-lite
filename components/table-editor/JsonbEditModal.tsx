import { JsonbCellEditor } from './JsonbCellEditor'
import styles from './TableEditorStyles.module.css'

type JsonbEditModalProps = {
  column: string
  value: unknown
  onSave: (value: unknown) => void
  onCancel: () => void
}

export function JsonbEditModal({ column, value, onSave, onCancel }: JsonbEditModalProps) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className={`modal-card ${styles.jsonbEditorModal}`}>
        <div className="modal-head">
          <div className="nav-title">Edit JSONB: {column}</div>
          <button className="btn small" onClick={onCancel}>
            Cancel
          </button>
        </div>
        <div className="modal-body">
          <JsonbCellEditor value={value} onSave={onSave} onCancel={onCancel} />
        </div>
      </div>
    </div>
  )
}
