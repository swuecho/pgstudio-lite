import { memo, useCallback, useLayoutEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import type { NotebookCell } from './types'
import styles from './NotebookPage.module.css'

/** The textarea grows with its text between these bounds; beyond the max it scrolls. */
const MIN_TEXTAREA_HEIGHT = 160
const MAX_TEXTAREA_HEIGHT = 640

type MarkdownCellBodyProps = {
  cell: NotebookCell
  draft: string
  previewMarkdown: boolean | undefined
  onTogglePreview: () => void
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
}

/**
 * Markdown cell: a self-sizing textarea, or the rendered preview. Cmd/Ctrl+Enter
 * in the textarea renders it (the same key that runs a SQL cell), and
 * double-clicking the preview goes back to editing.
 */
export const MarkdownCellBody = memo(function MarkdownCellBody({
  cell,
  draft,
  previewMarkdown,
  onTogglePreview,
  onChange,
}: MarkdownCellBodyProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const editing = !cell.collapsed && !previewMarkdown

  useLayoutEffect(() => {
    const element = textareaRef.current
    if (!element || !editing) return
    element.style.height = 'auto'
    const next = Math.min(MAX_TEXTAREA_HEIGHT, Math.max(MIN_TEXTAREA_HEIGHT, element.scrollHeight))
    element.style.height = `${next}px`
    element.style.overflowY = element.scrollHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden'
  }, [draft, editing])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        onTogglePreview()
      }
    },
    [onTogglePreview]
  )

  const handlePreviewDoubleClick = useCallback(() => {
    if (!cell.collapsed) onTogglePreview()
  }, [cell.collapsed, onTogglePreview])

  return (
    <>
      {!cell.collapsed ? (
        <div className={styles.markdownActions}>
          <button
            className="btn small"
            onClick={onTogglePreview}
            title={
              previewMarkdown
                ? 'Edit the Markdown source (or double-click the preview)'
                : 'Render (⌘/Ctrl+Enter)'
            }
          >
            {previewMarkdown ? 'Edit' : 'Preview'}
          </button>
        </div>
      ) : null}
      {cell.collapsed || previewMarkdown ? (
        <div
          className={[styles.markdownShell, cell.collapsed ? styles.markdownShellCollapsed : '']
            .filter(Boolean)
            .join(' ')}
          onDoubleClick={handlePreviewDoubleClick}
          title={cell.collapsed ? undefined : 'Double-click to edit'}
        >
          <MarkdownPreview source={draft} />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          className={styles.markdownTextarea}
          value={draft}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          aria-label="Markdown source"
        />
      )}
    </>
  )
})

const MarkdownPreview = memo(function MarkdownPreview({ source }: { source: string }) {
  return (
    <div className={styles.markdownPreview}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
          code: ({ className, children, ...props }) => {
            const isBlock = Boolean(className)
            if (!isBlock) return <code {...props}>{children}</code>
            return (
              <pre className={styles.markdownCodeBlock}>
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            )
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
})
