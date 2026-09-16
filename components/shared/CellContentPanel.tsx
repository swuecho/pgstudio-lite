import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBottomPanelResizer } from '@/hooks/useBottomPanelResizer'
import { formatCellContentForView, parseJsonForView } from '@/lib/format-cell-content'
import { getColumnKind } from '@/lib/table-column-kind'
import { JsonTreeView } from './JsonTreeView'
import styles from './CellContentPanel.module.css'
import { copyTextToClipboard } from '@/lib/clipboard'

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
  const [mode, setMode] = useState<'tree' | 'raw'>('tree')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { height, isResizing, panelRef, startResize } = useBottomPanelResizer()
  const text = formatCellContentForView(value, dataType)
  const kind = dataType ? getColumnKind(dataType) : null
  const json = useMemo(() => parseJsonForView(value, dataType), [value, dataType])
  const showTree = json !== null && mode === 'tree'

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      document.body.classList.remove('resizing-cell-panel')
    }
  }, [])

  const handleCopy = useCallback(() => {
    void copyTextToClipboard(text).then((ok) => {
      if (!ok) return
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 900)
    })
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
          {json ? (
            <div className={styles.modeToggle} role="group" aria-label="Cell view mode">
              <button
                type="button"
                className={`${styles.modeButton} ${mode === 'tree' ? styles.modeButtonActive : ''}`.trim()}
                aria-pressed={mode === 'tree'}
                onClick={() => setMode('tree')}
              >
                Tree
              </button>
              <button
                type="button"
                className={`${styles.modeButton} ${mode === 'raw' ? styles.modeButtonActive : ''}`.trim()}
                aria-pressed={mode === 'raw'}
                onClick={() => setMode('raw')}
              >
                Raw
              </button>
            </div>
          ) : null}
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
        {showTree ? <JsonTreeView data={json.data} /> : <pre className={styles.content}>{text}</pre>}
      </div>
    </section>
  )
}
