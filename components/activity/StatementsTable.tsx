import type { ActivityStatement } from '@/features/activity/activity.service'
import { formatMs, formatNumber } from './activityFormat'
import { QueryPreviewCell } from './QueryPreviewCell'
import styles from './ActivityPage.module.css'

type StatementsTableProps = {
  statements: ActivityStatement[]
  expandedQueryid: string | null
  onToggleExpand: (queryid: string) => void
  onOpenInEditor: (key: string, query: string) => void
}

export function StatementsTable({
  statements,
  expandedQueryid,
  onToggleExpand,
  onOpenInEditor,
}: StatementsTableProps) {
  if (statements.length === 0) {
    return <div className={styles.empty}>No statements collected yet.</div>
  }
  return (
    <div className={styles.tableScroll}>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th>calls</th>
            <th>total</th>
            <th>mean</th>
            <th>min</th>
            <th>max</th>
            <th>rows</th>
            <th>blks hit</th>
            <th>blks read</th>
            <th>query</th>
          </tr>
        </thead>
        <tbody>
          {statements.map((statement, index) => {
            // queryid is null when pg_stat_statements was reset mid-read.
            const key = statement.queryid ?? `idx-${index}`
            return (
              <tr key={key}>
                <td>{formatNumber(statement.calls)}</td>
                <td>{formatMs(statement.total_exec_time_ms)}</td>
                <td>{formatMs(statement.mean_exec_time_ms)}</td>
                <td>{formatMs(statement.min_exec_time_ms)}</td>
                <td>{formatMs(statement.max_exec_time_ms)}</td>
                <td>{formatNumber(statement.rows)}</td>
                <td>{formatNumber(statement.shared_blks_hit)}</td>
                <td>{formatNumber(statement.shared_blks_read)}</td>
                <QueryPreviewCell
                  query={statement.query}
                  expanded={expandedQueryid === key}
                  onToggleExpand={() => onToggleExpand(key)}
                  onOpenInEditor={() => onOpenInEditor(key, statement.query)}
                />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
