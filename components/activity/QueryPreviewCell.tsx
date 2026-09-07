import { QUERY_PREVIEW_LIMIT } from './activityFormat'
import styles from './ActivityPage.module.css'

type QueryPreviewCellProps = {
  query: string
  expanded: boolean
  onToggleExpand: () => void
  onOpenInEditor: () => void
}

/** A query column: truncated text with expand and "open in editor" links. */
export function QueryPreviewCell({ query, expanded, onToggleExpand, onOpenInEditor }: QueryPreviewCellProps) {
  const preview =
    query.length > QUERY_PREVIEW_LIMIT && !expanded ? query.slice(0, QUERY_PREVIEW_LIMIT) + '…' : query
  return (
    <td className={styles.queryCell}>
      <div className={expanded ? '' : styles.queryTruncated}>{preview}</div>
      <div className={styles.cellLinks}>
        {query.length > QUERY_PREVIEW_LIMIT ? (
          <button className={styles.expandBtn} onClick={onToggleExpand}>
            {expanded ? 'collapse' : 'expand'}
          </button>
        ) : null}
        {query.trim() ? (
          <button className={styles.expandBtn} title="Open in SQL editor" onClick={onOpenInEditor}>
            ↗ editor
          </button>
        ) : null}
      </div>
    </td>
  )
}
