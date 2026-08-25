import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { suggestBookmarkTitle, type TableEditorViewState } from '@/lib/table-editor-views'
import { isOutsideToolbarPopover, useToolbarPopoverPosition } from './useToolbarPopover'
import styles from './SaveViewPopover.module.css'

type SaveViewPopoverProps = {
  currentView: TableEditorViewState
  onSave: (view: TableEditorViewState, title: string) => void | Promise<void | string>
  onSaved?: () => void
}

export function SaveViewPopover({ currentView, onSave, onSaved }: SaveViewPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const dropdownStyle = useToolbarPopoverPosition(isOpen, anchorRef, 280)

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (isOutsideToolbarPopover(event.target as Node, [anchorRef.current, dropdownRef.current])) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    setTitle(suggestBookmarkTitle(currentView.activeTable, currentView.filter))
    window.setTimeout(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }, 0)
  }, [isOpen, currentView])

  async function handleSave() {
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      await onSave(currentView, title)
      setIsOpen(false)
      onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  const dropdown = isOpen ? (
    <div
      ref={dropdownRef}
      className={styles.dropdown}
      style={dropdownStyle}
      role="dialog"
      aria-label="Save view"
    >
      <div className={styles.header}>
        <span className={styles.title}>Save view</span>
      </div>
      <div className={styles.body}>
        <label className={styles.field}>
          <span className={styles.label}>Title</span>
          <input
            ref={titleInputRef}
            className={styles.control}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Bookmark title"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void handleSave()
              }
              if (event.key === 'Escape') setIsOpen(false)
            }}
          />
        </label>
      </div>
      <div className={styles.footer}>
        <button className="btn small" type="button" onClick={() => setIsOpen(false)} disabled={saving}>
          Cancel
        </button>
        <button
          className="btn small primary"
          type="button"
          onClick={() => void handleSave()}
          disabled={!title.trim() || saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  ) : null

  return (
    <div className={styles.popover}>
      <button
        ref={anchorRef}
        type="button"
        className="btn small"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        Save view
      </button>
      {dropdown && portalReady ? createPortal(dropdown, document.body) : null}
    </div>
  )
}
