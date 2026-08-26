import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

type QuickActionsHotkeyOptions = {
  /** Focused by the `/` shortcut, when the page has a search box. */
  searchRef?: RefObject<HTMLInputElement | null>
  onEscapeSearch?: () => void
}

/**
 * ⌘K / Ctrl+K opens quick actions and `/` jumps to search. Both existed only on
 * the SQL editor page; this shares them across pages.
 */
export function useQuickActionsHotkey(options: QuickActionsHotkeyOptions = {}) {
  const [open, setOpen] = useState(false)
  const { searchRef, onEscapeSearch } = options

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === 'k') {
        event.preventDefault()
        setOpen(true)
        return
      }

      if (
        event.key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isEditableTarget(event.target)
      ) {
        if (!searchRef?.current) return
        event.preventDefault()
        searchRef.current.focus()
        searchRef.current.select()
        return
      }

      if (event.key === 'Escape' && searchRef?.current && document.activeElement === searchRef.current) {
        if (onEscapeSearch) {
          onEscapeSearch()
        } else {
          searchRef.current.blur()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onEscapeSearch, searchRef])

  return { open, setOpen }
}
