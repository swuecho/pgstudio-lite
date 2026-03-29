import { type ReactNode, useEffect, useId, useRef } from 'react'

type DialogShellProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  widthClassName?: string
}

function DialogShell({ open, title, onClose, children, footer, widthClassName }: DialogShellProps) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={`modal-card ${widthClassName || ''}`.trim()} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div className="nav-title" id={titleId}>
            {title}
          </div>
          <button className="btn small" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-body">
          {children}
          {footer ? <div className="dialog-footer">{footer}</div> : null}
        </div>
      </div>
    </div>
  )
}

type ConfirmDialogProps = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  confirmTone?: 'default' | 'danger' | 'primary'
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmTone = 'default',
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const confirmClassName =
    confirmTone === 'danger' ? 'btn small danger' : confirmTone === 'primary' ? 'btn small primary' : 'btn small'

  return (
    <DialogShell
      open={open}
      title={title}
      onClose={onClose}
      widthClassName="dialog-confirm-card"
      footer={
        <>
          <button className="btn small" onClick={onClose}>
            Cancel
          </button>
          <button className={confirmClassName} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="modal-section">
        <p className="dialog-copy">{message}</p>
      </div>
    </DialogShell>
  )
}

type PromptDialogProps = {
  open: boolean
  title: string
  label: string
  value: string
  placeholder?: string
  hint?: string
  submitLabel?: string
  submitTone?: 'default' | 'primary'
  onChange: (value: string) => void
  onSubmit: () => void
  onClose: () => void
}

export function PromptDialog({
  open,
  title,
  label,
  value,
  placeholder,
  hint,
  submitLabel = 'Save',
  submitTone = 'primary',
  onChange,
  onSubmit,
  onClose,
}: PromptDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmClassName = submitTone === 'primary' ? 'btn small primary' : 'btn small'

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open])

  return (
    <DialogShell
      open={open}
      title={title}
      onClose={onClose}
      widthClassName="dialog-prompt-card"
      footer={
        <>
          <button className="btn small" onClick={onClose}>
            Cancel
          </button>
          <button className={confirmClassName} onClick={onSubmit} disabled={!value.trim()}>
            {submitLabel}
          </button>
        </>
      }
    >
      <div className="modal-section">
        <label className="dialog-field">
          <span className="dialog-label">{label}</span>
          <input
            ref={inputRef}
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && value.trim()) {
                event.preventDefault()
                onSubmit()
              }
            }}
          />
        </label>
        {hint ? <div className="history-meta">{hint}</div> : null}
      </div>
    </DialogShell>
  )
}

type QuickActionItem = {
  id: string
  title: string
  description: string
  onSelect: () => void
}

type QuickActionsDialogProps = {
  open: boolean
  items: QuickActionItem[]
  onClose: () => void
}

export function QuickActionsDialog({ open, items, onClose }: QuickActionsDialogProps) {
  return (
    <DialogShell open={open} title="Quick Actions" onClose={onClose} widthClassName="dialog-quick-actions-card">
      <div className="dialog-action-list">
        {items.map((item) => (
          <button
            key={item.id}
            className="dialog-action-item"
            onClick={() => {
              item.onSelect()
              onClose()
            }}
          >
            <span className="dialog-action-title">{item.title}</span>
            <span className="dialog-action-description">{item.description}</span>
          </button>
        ))}
      </div>
    </DialogShell>
  )
}
