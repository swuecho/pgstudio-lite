import type { GridDialogState } from './useGridRowChanges'

type GridConfirmDialogProps = {
  dialog: GridDialogState
  onClose: () => void
}

/** The "Preview row change" / "Preview row delete" modal. */
export function GridConfirmDialog({ dialog, onClose }: GridConfirmDialogProps) {
  const cancel = () => {
    dialog.onCancel?.()
    onClose()
  }
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card table-confirm-modal">
        <div className="modal-head">
          <div className="nav-title">{dialog.title}</div>
          <button className="btn small" onClick={cancel}>
            Close
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-section">
            {dialog.lines.map((line, index) => (
              <div key={`${line}-${index}`} className="history-query">
                {line}
              </div>
            ))}
            <div className="history-actions">
              {!dialog.hideCancel ? (
                <button className="btn small" onClick={cancel}>
                  {dialog.cancelLabel || 'Cancel'}
                </button>
              ) : null}
              <button
                className="btn small primary"
                onClick={() => {
                  dialog.onConfirm()
                  onClose()
                }}
              >
                {dialog.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
