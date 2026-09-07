import { useCallback, useEffect, useRef, useState } from 'react'
import { copyTextToClipboard } from '@/lib/clipboard'

type CopyableCellValueProps = {
  text: string
  /** Shown in the grid; full `text` is still copied on click. */
  displayText?: string
  className?: string
  title?: string
  maxDisplayLength?: number
  /**
   * Grids pass -1 for every cell but the roving one (see useGridKeyboardNav);
   * standalone cells keep the default so they stay reachable by Tab.
   */
  tabIndex?: number
  /**
   * Names the cell for assistive tech, e.g. "email, row 3". Without it every
   * cell in a grid announces the same "Click to copy".
   */
  ariaLabel?: string
  /** Lets the owning grid track which cell holds focus. */
  onCellFocus?: () => void
  'data-grid-cell'?: string
}

const DEFAULT_MAX_DISPLAY_LENGTH = 500

export function CopyableCellValue({
  text,
  displayText,
  className,
  title,
  maxDisplayLength = DEFAULT_MAX_DISPLAY_LENGTH,
  tabIndex = 0,
  ariaLabel,
  onCellFocus,
  'data-grid-cell': dataGridCell,
}: CopyableCellValueProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copied = copyState === 'copied'
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleClick = useCallback(() => {
    void copyTextToClipboard(text).then((ok) => {
      setCopyState(ok ? 'copied' : 'failed')
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopyState('idle'), ok ? 900 : 1800)
    })
  }, [text])

  const baseDisplay = displayText ?? text
  const truncated = baseDisplay.length > maxDisplayLength
  const renderedText = truncated ? `${baseDisplay.slice(0, maxDisplayLength)}…` : baseDisplay
  const shortenedUuid = displayText !== undefined && displayText !== text
  const copyHint = copied
    ? 'Copied!'
    : copyState === 'failed'
      ? 'Copy failed'
      : shortenedUuid
        ? 'Click to copy full UUID'
        : truncated
          ? `Click to copy (full value is ${text.length} chars)`
          : 'Click to copy'
  const computedTitle = title || copyHint

  return (
    <code
      className={`copyable-cell ${copied ? 'copyable-cell-copied' : ''} ${className || ''}`.trim()}
      role="button"
      tabIndex={tabIndex}
      title={computedTitle}
      aria-label={ariaLabel ? `${ariaLabel}: ${copyHint}` : undefined}
      data-grid-cell={dataGridCell}
      onFocus={onCellFocus}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleClick()
          return
        }
        // ⌘C / Ctrl+C copies the focused cell without disturbing a real
        // selection the user may have made inside it.
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
          if (window.getSelection()?.toString()) return
          event.preventDefault()
          handleClick()
        }
      }}
    >
      {renderedText}
    </code>
  )
}
