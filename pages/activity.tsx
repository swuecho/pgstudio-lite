import { NavRail } from '@/components/shared/NavRail'
import { PageHead } from '@/components/shared/PageHead'
import { useRouter } from 'next/router'
import { useCallback, useMemo, useState } from 'react'
import { SettingsPanel } from '../components/settings/SettingsPanel'
import { SettingsButton } from '../components/settings/SettingsButton'
import { ConfirmDialog } from '../components/shared/Dialog'
import { useActiveConnection } from '../components/shared/hooks/useActiveConnection'
import { LocksTable } from '../components/activity/LocksTable'
import { EMPTY_SESSION_FILTERS, SessionsFilterBar } from '../components/activity/SessionsFilterBar'
import { SessionsTable, type SessionAction } from '../components/activity/SessionsTable'
import { StatementsNotInstalled } from '../components/activity/StatementsNotInstalled'
import { StatementsTable } from '../components/activity/StatementsTable'
import {
  useActivityLocks,
  useActivitySessions,
  useActivityStatements,
  useControlBackend,
  useStatementsAction,
} from '../features/activity/useActivity'
import type { StatementsOrderBy } from '../features/activity/activity.service'
import styles from '../components/activity/ActivityPage.module.css'

const INTERVAL_OPTIONS = [
  { label: '1s', value: 1000 },
  { label: '2s', value: 2000 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },
  { label: '30s', value: 30000 },
]

type Tab = 'sessions' | 'locks' | 'statements'
type PendingAction = { pid: number; action: SessionAction }

export default function ActivityPage() {
  const { connections, connectionName, setConnectionName, connectionReadOnly } = useActiveConnection()

  const [tab, setTab] = useState<Tab>('sessions')
  const [intervalMs, setIntervalMs] = useState<number>(2000)
  const [paused, setPaused] = useState(false)
  const [filters, setFilters] = useState(EMPTY_SESSION_FILTERS)
  const [expandedPid, setExpandedPid] = useState<number | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [statementsOrderBy, setStatementsOrderBy] = useState<StatementsOrderBy>('total')
  const [expandedQueryid, setExpandedQueryid] = useState<string | null>(null)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const router = useRouter()
  const openInEditor = useCallback(
    (query: string, title: string) => {
      if (!query.trim()) return
      void router.push({ pathname: '/', query: { query, title } })
    },
    [router]
  )

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
  const statementsQuery = useActivityStatements(connectionName || '', {
    intervalMs,
    paused,
    enabled: tab === 'statements',
    orderBy: statementsOrderBy,
  })
  const control = useControlBackend(connectionName || '')
  const statementsActionMutation = useStatementsAction(connectionName || '')

  const sessions = useMemo(() => sessionsQuery.data?.sessions ?? [], [sessionsQuery.data?.sessions])
  const locks = useMemo(() => locksQuery.data?.locks ?? [], [locksQuery.data?.locks])
  const statements = useMemo(() => statementsQuery.data?.statements ?? [], [statementsQuery.data?.statements])
  const statementsInstalled = statementsQuery.data?.installed ?? true

  const blockingPids = useMemo(() => {
    const set = new Set<number>()
    for (const session of sessions) {
      for (const pid of session.blocked_by) set.add(pid)
    }
    return set
  }, [sessions])

  const filteredSessions = useMemo(() => {
    const user = filters.user.toLowerCase()
    const app = filters.app.toLowerCase()
    return sessions.filter((session) => {
      if (user && !(session.user || '').toLowerCase().includes(user)) return false
      if (app && !(session.application_name || '').toLowerCase().includes(app)) return false
      if (filters.state !== 'all' && session.state !== filters.state) return false
      if (filters.onlyBlocked && session.blocked_by.length === 0) return false
      return true
    })
  }, [sessions, filters])

  const activeQuery = tab === 'sessions' ? sessionsQuery : tab === 'locks' ? locksQuery : statementsQuery
  const fetchedAt = activeQuery.data?.fetchedAt
  const isLoading = activeQuery.isLoading
  const error = activeQuery.error
  const errorMessage = error instanceof Error ? error.message : null

  const statusText = (() => {
    if (errorMessage) return `error: ${errorMessage}`
    if (isLoading && !fetchedAt) return 'loading...'
    const count =
      tab === 'sessions' ? filteredSessions.length : tab === 'locks' ? locks.length : statements.length
    const time = fetchedAt ? new Date(fetchedAt).toLocaleTimeString() : ''
    const label = tab === 'sessions' ? 'sessions' : tab === 'locks' ? 'locks' : 'statements'
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
      <NavRail active="activity" />

      <PageHead title="Activity" />
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
            <select value={connectionName || ''} onChange={(event) => setConnectionName(event.target.value)}>
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
            <button
              className={`${styles.tabBtn} ${tab === 'statements' ? styles.active : ''}`}
              onClick={() => setTab('statements')}
            >
              Statements
            </button>
          </div>
          <div className={styles.toolbarRight}>
            {tab === 'statements' && statementsInstalled ? (
              <>
                <select
                  value={statementsOrderBy}
                  onChange={(event) => setStatementsOrderBy(event.target.value as StatementsOrderBy)}
                  title="Sort"
                >
                  <option value="total">total time</option>
                  <option value="mean">mean time</option>
                  <option value="calls">calls</option>
                </select>
                <button
                  className="btn small danger"
                  disabled={connectionReadOnly}
                  title={connectionReadOnly ? 'Connection is read-only' : 'pg_stat_statements_reset'}
                  onClick={() => setResetConfirmOpen(true)}
                >
                  Reset stats
                </button>
              </>
            ) : null}
            {connectionReadOnly ? <span className="history-meta">connection is read-only</span> : null}
          </div>
        </div>

        {tab === 'sessions' ? (
          <>
            <SessionsFilterBar filters={filters} onChange={setFilters} />
            <SessionsTable
              sessions={filteredSessions}
              blockingPids={blockingPids}
              readOnly={connectionReadOnly}
              expandedPid={expandedPid}
              onToggleExpand={(pid) => setExpandedPid((prev) => (prev === pid ? null : pid))}
              onAction={(pid, action) => setPendingAction({ pid, action })}
              onOpenInEditor={(pid, query) => openInEditor(query, `pid ${pid}`)}
            />
          </>
        ) : tab === 'locks' ? (
          <LocksTable locks={locks} />
        ) : statementsInstalled ? (
          <StatementsTable
            statements={statements}
            expandedQueryid={expandedQueryid}
            onToggleExpand={(queryid) => setExpandedQueryid((prev) => (prev === queryid ? null : queryid))}
            onOpenInEditor={(key, query) => openInEditor(query, `stmt ${key.slice(0, 8)}`)}
          />
        ) : (
          <StatementsNotInstalled
            readOnly={connectionReadOnly}
            installing={statementsActionMutation.isPending}
            installError={
              statementsActionMutation.error instanceof Error ? statementsActionMutation.error.message : null
            }
            onInstall={() => statementsActionMutation.mutate('install')}
          />
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

      <ConfirmDialog
        open={resetConfirmOpen}
        title="Reset pg_stat_statements"
        message="Reset all collected query statistics? This calls pg_stat_statements_reset() and cannot be undone."
        confirmLabel="Reset"
        confirmTone="danger"
        onClose={() => setResetConfirmOpen(false)}
        onConfirm={() => {
          statementsActionMutation.mutate('reset', {
            onSettled: () => setResetConfirmOpen(false),
          })
        }}
      />
    </div>
  )
}
