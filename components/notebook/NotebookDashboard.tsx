import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { CellResult } from './CellResult'
import type { NotebookPageController } from './useNotebookPageState'
import styles from './NotebookPage.module.css'

type NotebookDashboardProps = {
  controller: NotebookPageController
}

export function NotebookDashboard({ controller }: NotebookDashboardProps) {
  const { sortedCells, resultsByCell, draftByCell, activeNotebookId } = controller

  if (!activeNotebookId) {
    return <div className="empty-state">Select a notebook to view its dashboard.</div>
  }

  const renderable = sortedCells.filter(
    (cell) => cell.type === 'markdown' || (cell.type === 'sql' && resultsByCell[cell.id])
  )

  if (renderable.length === 0) {
    return (
      <div className="empty-state">
        Nothing to show yet. Run SQL cells (or add Markdown), then switch back to Dashboard.
      </div>
    )
  }

  return (
    <div className={styles.dashboardGrid}>
      {renderable.map((cell) =>
        cell.type === 'markdown' ? (
          <div key={cell.id} className={`${styles.dashboardCard} ${styles.dashboardMarkdownCard}`}>
            <div className={styles.markdownPreview}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize]}
                components={{
                  a: ({ ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
                }}
              >
                {draftByCell[cell.id] ?? cell.content}
              </ReactMarkdown>
            </div>
          </div>
        ) : (
          <div key={cell.id} className={styles.dashboardCard}>
            <CellResult
              result={resultsByCell[cell.id]}
              notebookId={cell.notebook_id}
              cellId={cell.id}
              hideToggle
            />
          </div>
        )
      )}
    </div>
  )
}
