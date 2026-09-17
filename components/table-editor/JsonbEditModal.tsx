import { useCallback, useState } from 'react'
import { JsonTreeEditor } from '@/components/shared/JsonTreeEditor'
import { useActiveConnectionColor } from '@/components/shared/ConnectionColorContext'
import { containerKind } from '@/lib/json-tree'
import { JsonbCellEditor } from './JsonbCellEditor'
import styles from './TableEditorStyles.module.css'

type JsonbEditModalProps = {
  column: string
  value: unknown
  onSave: (value: unknown) => void
  onCancel: () => void
}

/** The stored cell as JSON text; jsonb reaches us parsed or as a string. */
function toJsonText(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function parseJsonText(text: string): { data: unknown } | { error: string } {
  const trimmed = text.trim()
  if (trimmed === '') return { data: null }
  try {
    return { data: JSON.parse(trimmed) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid JSON' }
  }
}

/**
 * Edits one jsonb cell either as a tree (keys and scalars in place) or as raw
 * JSON in Monaco. Both modes edit the same document: switching re-parses, and
 * an unparseable draft blocks the switch and Save rather than losing the text.
 */
export function JsonbEditModal({ column, value, onSave, onCancel }: JsonbEditModalProps) {
  const initialText = toJsonText(value)
  const initialParsed = parseJsonText(initialText)
  const initialData = 'data' in initialParsed ? initialParsed.data : null

  const [mode, setMode] = useState<'tree' | 'raw'>(containerKind(initialData) ? 'tree' : 'raw')
  const [draft, setDraft] = useState<unknown>(initialData)
  const [text, setText] = useState(initialText)
  const [error, setError] = useState<string | null>(null)
  const connectionColor = useActiveConnectionColor()

  const showTree = useCallback(() => {
    const parsed = parseJsonText(text)
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }
    setError(null)
    setDraft(parsed.data)
    setMode('tree')
  }, [text])

  const showRaw = useCallback(() => {
    setError(null)
    setText(JSON.stringify(draft, null, 2))
    setMode('raw')
  }, [draft])

  const handleRawChange = useCallback((next: string) => {
    setText(next)
    setError(null)
  }, [])

  const handleSave = useCallback(() => {
    if (mode === 'tree') {
      onSave(draft)
      return
    }
    const parsed = parseJsonText(text)
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }
    onSave(parsed.data)
  }, [mode, draft, text, onSave])

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className={`modal-card ${styles.jsonbEditorModal}`}>
        <div className="modal-head">
          <div className="nav-title">Edit JSONB: {column}</div>
          <div className={styles.jsonbEditorActions}>
            <div className={styles.jsonbModeToggle} role="group" aria-label="Editor mode">
              <button
                type="button"
                className={`${styles.jsonbModeButton} ${mode === 'tree' ? styles.jsonbModeButtonActive : ''}`.trim()}
                aria-pressed={mode === 'tree'}
                onClick={showTree}
              >
                Tree
              </button>
              <button
                type="button"
                className={`${styles.jsonbModeButton} ${mode === 'raw' ? styles.jsonbModeButtonActive : ''}`.trim()}
                aria-pressed={mode === 'raw'}
                onClick={showRaw}
              >
                Raw
              </button>
            </div>
            <button className="btn small primary" onClick={handleSave}>
              Save
            </button>
            <button className="btn small" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
        <div className="modal-body">
          {error ? (
            <div className={styles.jsonbEditorError} role="alert">
              {error}
            </div>
          ) : null}
          {mode === 'tree' ? (
            <div className={styles.jsonbTreeWrapper} style={{ background: connectionColor.tint }}>
              <JsonTreeEditor value={draft} onChange={setDraft} />
            </div>
          ) : (
            <JsonbCellEditor text={text} onChange={handleRawChange} />
          )}
        </div>
      </div>
    </div>
  )
}
