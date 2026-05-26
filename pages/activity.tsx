import Link from 'next/link'
import { useMemo, useState } from 'react'
import ThemeToggle from '../components/theme-toggle'
import { SettingsPanel } from '../components/settings/SettingsPanel'
import { SettingsButton } from '../components/settings/SettingsButton'
import { ConfirmDialog } from '../components/shared/Dialog'
import { useActiveConnection } from '../components/shared/hooks/useActiveConnection'
import {
  useActivityLocks,
  useActivitySessions,
  useControlBackend,
} from '../features/activity/useActivity'
import type { ActivityLock, ActivitySession } from '../features/activity/activity.service'
import styles from '../components/activity/ActivityPage.module.css'

const INTERVAL_OPTIONS = [
  { label: '1s', value: 1000 },
  { label: '2s', value: 2000 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },
  { label: '30s', value: 30000 },
]

const STATE_OPTIONS = [
  'active',
  'idle',
  'idle in transaction',
  'idle in transaction (aborted)',
  'fastpath function call',
  'disabled',
]

type Tab = 'sessions' | 'locks'
type PendingAction = { pid: number; action: 'cancel' | 'terminate' }

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '-'
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m < 60) return `${m}m ${s}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function formatWait(session: ActivitySession): string {
  if (!session.wait_event_type && !session.wait_event) return ''
  if (session.wait_event_type && session.wait_event)
    return `${session.wait_event_type}:${session.wait_event}`
  return session.wait_event_type || session.wait_event || ''
}

export default function ActivityPage() {
  const {
    connections,
    connectionName,
    setConnectionName,
    connectionReadOnly,
  } = useActiveConnection()

  const [tab, setTab] = useState<Tab>('sessions')
  const [intervalMs, setIntervalMs] = useState<number>(2000)
  const [paused, setPaused] = useState(false)
  const [filterUser, setFilterUser] = useState('')
  const [filterApp, setFilterApp] = useState('')
  const [filterState, setFilterState] = useState<string>('all')
  const [onlyBlocked, setOnlyBlocked] = useState(false)
  const [expandedPid, setExpandedPid] = useState<number | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)

  const sessionsQuery = useActivitySessions(connectionName || '', {
    intervalMs,
    paused,
    enabled: tab === 'sessions',
  })
  const locksQuery = useActivityLocks(connectionName || '', {
    intervalMs,
    paused,
    enabled: tab === 'locks',
  })
  const control = useControlBackend(connectionName || '')

  const sessions = useMemo(
    () => sessionsQuery.data?.sessions ?? [],
    [sessionsQuery.data?.sessions]
  )
  const locks = useMemo(() => locksQuery.data?.locks ?? [], [locksQuery.data?.locks])

  const blockingPids = useMemo(() => {
    const set = new Set<number>()
    for (const session of sessions) {
      for (const pid of session.blocked_by) set.add(pid)
    }
    return set
  }, [sessions])

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      if (filterUser && !(session.user || '').toLowerCase().includes(filterUser.toLowerCase()))
        return false
      if (
        filterApp &&
        !(session.application_name || '').toLowerCase().includes(filterApp.toLowerCase())
      )
        return false
      if (filterState !== 'all' && session.state !== filterState) return false
      if (onlyBlocked && session.blocked_by.length === 0) return false
      return true
    })
  }, [sessions, filterUser, filterApp, filterState, onlyBlocked])

  const fetchedAt = tab === 'sessions' ? sessionsQuery.data?.fetchedAt : locksQuery.data?.fetchedAt
  const isLoading = tab === 'sessions' ? sessionsQuery.isLoading : locksQuery.isLoading
  const error = tab === 'sessions' ? sessionsQuery.error : locksQuery.error
  const errorMessage = error instanceof Error ? error.message : null

  const statusText = (() => {
    if (errorMessage) return `error: ${errorMessage}`
    if (isLoading && !fetchedAt) return 'loading...'
    const count = tab === 'sessions' ? filteredSessions.length : locks.length
    const time = fetchedAt ? new Date(fetchedAt).toLocaleTimeString() : ''
    const label = tab === 'sessions' ? 'sessions' : 'locks'
    return `${count} ${label}${time ? ` · ${time}` : ''}${paused ? ' · paused' : ''}`
  })()

  const onConfirmAction = () => {
    if (!pendingAction) return
    control.mutate(pendingAction, {
      onSettled: () => setPendingAction(null),
    })
  }

  return (
    <div className={styles.layoutRoot}>
      <aside className={styles.layoutRail}>
        <Link className={styles.railBtn} href="/">
          SQL
        </Link>
        <Link className={styles.railBtn} href="/table-editor">
          TB
        </Link>
        <Link className={styles.railBtn} href="/notebook">
          NB
        </Link>
        <button className={`${styles.railBtn} ${styles.active}`}>AC</button>
        <div className="mt-auto flex justify-center">
          <ThemeToggle />
        </div>
      </aside>

      <main className={styles.layoutMain}>
        <div className={styles.header}>
          <div className={styles.title}>Activity · {connectionName || '-'}</div>
          <div className={styles.headerRight}>
            <span className={`status-pill ${errorMessage ? 'error' : 'ok'}`}>{statusText}</span>
            <select
              value={intervalMs}
              onChange={(event) => setIntervalMs(Number(event.target.value))}
              title="Refresh interval"
            >
              {INTERVAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button className="btn small" onClick={() => setPaused((value) => !value)}>
              {paused ? 'Resume' : 'Pause'}
            </button>
            <select
              value={connectionName || ''}
              onChange={(event) => setConnectionName(event.target.value)}
            >
              {connections.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                  {c.readOnly ? ' (read-only)' : ''}
                </option>
              ))}
            </select>
            <SettingsButton section="connections" label="Settings" />
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tabBtn} ${tab === 'sessions' ? styles.active : ''}`}
              onClick={() => setTab('sessions')}
            >
              Sessions
            </button>
            <button
              className={`${styles.tabBtn} ${tab === 'locks' ? styles.active : ''}`}
              onClick={() => setTab('locks')}
            >
              Locks
            </button>
          </div>
          <div className={styles.toolbarRight}>
            {connectionReadOnly ? (
              <span className="history-meta">connection is read-only</span>
            ) : null}
          </div>
        </div>

        {tab === 'sessions' ? (
          <>
            <div className={styles.filterBar}>
              <input
                placeholder="user"
                value={filterUser}
                onChange={(event) => setFilterUser(event.target.value)}
              />
              <input
                placeholder="application_name"
                value={filterApp}
                onChange={(event) => setFilterApp(event.target.value)}
              />
              <select value={filterState} onChange={(event) => setFilterState(event.target.value)}>
                <option value="all">any state</option>
                {STATE_OPTIONS.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
              <label>
                <input
                  type="checkbox"
                  checked={onlyBlocked}
                  onChange={(event) => setOnlyBlocked(event.target.checked)}
                />
                only blocked
              </label>
            </div>
            <SessionsTable
              sessions={filteredSessions}
              blockingPids={blockingPids}
              readOnly={connectionReadOnly}
              expandedPid={expandedPid}
              onToggleExpand={(pid) => setExpandedPid((prev) => (prev === pid ? null : pid))}
              onAction={(pid, action) => setPendingAction({ pid, action })}
            />
          </>
        ) : (
          <LocksTable locks={locks} />
        )}
      </main>

      <SettingsPanel />

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.action === 'terminate' ? 'Terminate backend' : 'Cancel query'}
        message={
          pendingAction
            ? pendingAction.action === 'terminate'
              ? `Terminate backend pid ${pendingAction.pid}? This drops the connection.`
              : `Cancel the running query on pid ${pendingAction.pid}?`
            : ''
        }
        confirmLabel={pendingAction?.action === 'terminate' ? 'Terminate' : 'Cancel query'}
        confirmTone="danger"
        onClose={() => setPendingAction(null)}
        onConfirm={onConfirmAction}
      />
    </div>
  )
}

type SessionsTableProps = {
  sessions: ActivitySession[]
  blockingPids: Set<number>
  readOnly: boolean
  expandedPid: number | null
  onToggleExpand: (pid: number) => void
  onAction: (pid: number, action: 'cancel' | 'terminate') => void
}

function SessionsTable({
  sessions,
  blockingPids,
  readOnly,
  expandedPid,
  onToggleExpand,
  onAction,
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
            const rowClass = isBlocker
              ? styles.rowBlocker
              : isBlocked
                ? styles.rowBlocked
                : ''
            const expanded = expandedPid === session.pid
            const queryPreview =
              session.query.length > 200 && !expanded
                ? session.query.slice(0, 200) + '…'
                : session.query
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
                <td className={styles.queryCell}>
                  <div className={expanded ? '' : styles.queryTruncated}>{queryPreview}</div>
                  {session.query.length > 200 ? (
                    <button
                      className={styles.expandBtn}
                      onClick={() => onToggleExpand(session.pid)}
                    >
                      {expanded ? 'collapse' : 'expand'}
                    </button>
                  ) : null}
                </td>
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

function LocksTable({ locks }: { locks: ActivityLock[] }) {
  if (locks.length === 0) {
    return <div className={styles.empty}>No locks.</div>
  }
  return (
    <div className={styles.tableScroll}>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th>pid</th>
            <th>granted</th>
            <th>mode</th>
            <th>locktype</th>
            <th>relation</th>
            <th>xid</th>
            <th>vxid</th>
            <th>user</th>
            <th>application</th>
            <th>state</th>
            <th>query</th>
          </tr>
        </thead>
        <tbody>
          {locks.map((lock, index) => (
            <tr
              key={`${lock.pid ?? 'null'}-${index}`}
              className={lock.granted ? '' : styles.rowBlocked}
            >
              <td>{lock.pid ?? ''}</td>
              <td>{lock.granted ? 'yes' : 'no'}</td>
              <td>{lock.mode ?? ''}</td>
              <td>{lock.locktype ?? ''}</td>
              <td>{lock.relation_name ?? ''}</td>
              <td>{lock.transaction_id ?? ''}</td>
              <td>{lock.virtualtransaction ?? ''}</td>
              <td>{lock.user ?? ''}</td>
              <td>{lock.application_name ?? ''}</td>
              <td>{lock.state ?? ''}</td>
              <td className={styles.queryCell}>
                <div className={styles.queryTruncated}>{lock.query ?? ''}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
