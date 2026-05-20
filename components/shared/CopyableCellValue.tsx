import { useCallback, useEffect, useRef, useState } from 'react'

type CopyableCellValueProps = {
  text: string
  /** Shown in the grid; full `text` is still copied on click. */
  displayText?: string
  className?: string
  title?: string
  maxDisplayLength?: number
}

const DEFAULT_MAX_DISPLAY_LENGTH = 500

export function CopyableCellValue({
  text,
  displayText,
  className,
  title,
  maxDisplayLength = DEFAULT_MAX_DISPLAY_LENGTH,
}: CopyableCellValueProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleClick = useCallback(() => {
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

  const baseDisplay = displayText ?? text
  const truncated = baseDisplay.length > maxDisplayLength
  const renderedText = truncated ? `${baseDisplay.slice(0, maxDisplayLength)}…` : baseDisplay
  const shortenedUuid = displayText !== undefined && displayText !== text
  const computedTitle =
    title ||
    (copied
      ? 'Copied!'
      : shortenedUuid
        ? 'Click to copy full UUID'
        : truncated
          ? `Click to copy (full value is ${text.length} chars)`
          : 'Click to copy')

  return (
    <code
      className={`copyable-cell ${copied ? 'copyable-cell-copied' : ''} ${className || ''}`.trim()}
      role="button"
      tabIndex={0}
      title={computedTitle}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleClick()
        }
      }}
    >
      {renderedText}
    </code>
  )
}
