import { useCallback, useEffect, useRef, useState } from 'react'
import { useBottomPanelResizer } from '../../hooks/useBottomPanelResizer'
import { formatCellContentForView } from '../../lib/format-cell-content'
import { getColumnKind } from '../../lib/table-column-kind'
import styles from './CellContentPanel.module.css'

export type CellContentPanelProps = {
  columnName: string
  dataType?: string
  value: unknown
  contextLabel?: string
  onClose: () => void
  onEdit?: () => void
}

export function CellContentPanel({
  columnName,
  dataType,
  value,
  contextLabel,
  onClose,
  onEdit,
}: CellContentPanelProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { height, isResizing, panelRef, startResize } = useBottomPanelResizer()
  const text = formatCellContentForView(value, dataType)
  const kind = dataType ? getColumnKind(dataType) : null

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      document.body.classList.remove('resizing-cell-panel')
    }
  }, [])

  const handleCopy = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setCopied(false), 900)
      })
      .catch(() => {})
  }, [text])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <section ref={panelRef} className={styles.panel} style={{ height }} aria-label="Cell content viewer">
      <div
        className={`${styles.resizeHandle} ${isResizing ? styles.resizeHandleActive : ''}`.trim()}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize cell viewer"
        onMouseDown={startResize}
      />
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.title}>{columnName}</span>
          {dataType ? <span className={styles.typeBadge}>{dataType}</span> : null}
          {contextLabel ? <span className={styles.context}>{contextLabel}</span> : null}
        </div>
        <div className={styles.actions}>
          {kind === 'json' && onEdit ? (
            <button type="button" className="btn small" onClick={onEdit}>
              Edit
            </button>
          ) : null}
          <button type="button" className="btn small" onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="btn small" onClick={onClose} aria-label="Close cell viewer">
            Close
          </button>
        </div>
      </div>
      <div className={styles.body}>
        <pre className={styles.content}>{text}</pre>
      </div>
    </section>
  )
}
