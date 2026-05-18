import { useCallback, useEffect, useRef, useState } from 'react'

type CopyableCellValueProps = {
  text: string
  className?: string
  title?: string
}

export function CopyableCellValue({ text, className, title }: CopyableCellValueProps) {
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

  return (
    <code
      className={`copyable-cell ${copied ? 'copyable-cell-copied' : ''} ${className || ''}`.trim()}
      role="button"
      tabIndex={0}
      title={title || (copied ? 'Copied!' : 'Click to copy')}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleClick()
        }
      }}
    >
      {text}
    </code>
  )
}
