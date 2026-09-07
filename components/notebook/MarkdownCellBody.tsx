import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import type { NotebookCell } from './types'
import styles from './NotebookPage.module.css'

type MarkdownCellBodyProps = {
  cell: NotebookCell
  draft: string
  previewMarkdown: boolean | undefined
  onTogglePreview: () => void
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
}

export const MarkdownCellBody = memo(function MarkdownCellBody({
  cell,
  draft,
  previewMarkdown,
  onTogglePreview,
  onChange,
}: MarkdownCellBodyProps) {
  return (
    <>
      {!cell.collapsed ? (
        <div className={styles.markdownActions}>
          <button className="btn small" onClick={onTogglePreview}>
            {previewMarkdown ? 'Edit' : 'Preview'}
          </button>
        </div>
      ) : null}
      {cell.collapsed || previewMarkdown ? (
        <div
          className={[styles.markdownShell, cell.collapsed ? styles.markdownShellCollapsed : '']
            .filter(Boolean)
            .join(' ')}
        >
          <MarkdownPreview source={draft} />
        </div>
      ) : (
        <textarea className={styles.markdownTextarea} value={draft} onChange={onChange} />
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
