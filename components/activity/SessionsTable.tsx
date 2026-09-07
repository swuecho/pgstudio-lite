import type { ActivitySession } from '@/features/activity/activity.service'
import { formatDuration, formatWait } from './activityFormat'
import { QueryPreviewCell } from './QueryPreviewCell'
import styles from './ActivityPage.module.css'

export type SessionAction = 'cancel' | 'terminate'

type SessionsTableProps = {
  sessions: ActivitySession[]
  /** Pids that some other session is waiting on; rendered as blockers. */
  blockingPids: Set<number>
  readOnly: boolean
  expandedPid: number | null
  onToggleExpand: (pid: number) => void
  onAction: (pid: number, action: SessionAction) => void
  onOpenInEditor: (pid: number, query: string) => void
}

export function SessionsTable({
  sessions,
  blockingPids,
  readOnly,
  expandedPid,
  onToggleExpand,
  onAction,
  onOpenInEditor,
}: SessionsTableProps) {
  if (sessions.length === 0) {
    return <div className={styles.empty}>No matching sessions.</div>
  }
  return (
    <div className={styles.tableScroll}>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th>pid</th>
            <th>user</th>
            <th>application</th>
            <th>client</th>
            <th>state</th>
            <th>wait</th>
            <th>duration</th>
            <th>blocked by</th>
            <th>query</th>
            <th>actions</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => {
            const isBlocker = blockingPids.has(session.pid)
            const isBlocked = session.blocked_by.length > 0
            const rowClass = isBlocker ? styles.rowBlocker : isBlocked ? styles.rowBlocked : ''
            return (
              <tr key={session.pid} className={rowClass}>
                <td>{session.pid}</td>
                <td>{session.user ?? ''}</td>
                <td>{session.application_name ?? ''}</td>
                <td>{session.client_addr ?? ''}</td>
                <td>{session.state ?? ''}</td>
                <td>{formatWait(session)}</td>
                <td>{formatDuration(session.duration_seconds)}</td>
                <td>{session.blocked_by.length > 0 ? session.blocked_by.join(', ') : ''}</td>
                <QueryPreviewCell
                  query={session.query}
                  expanded={expandedPid === session.pid}
                  onToggleExpand={() => onToggleExpand(session.pid)}
                  onOpenInEditor={() => onOpenInEditor(session.pid, session.query)}
                />
                <td>
                  <div className={styles.actionsCell}>
                    <button
                      className="btn small"
                      disabled={readOnly}
                      title={readOnly ? 'Connection is read-only' : 'pg_cancel_backend'}
                      onClick={() => onAction(session.pid, 'cancel')}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn small danger"
                      disabled={readOnly}
                      title={readOnly ? 'Connection is read-only' : 'pg_terminate_backend'}
                      onClick={() => onAction(session.pid, 'terminate')}
                    >
                      Terminate
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
