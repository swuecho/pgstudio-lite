import { fetchJson } from '@/lib/http'

export type ActivitySession = {
  pid: number
  user: string | null
  application_name: string | null
  client_addr: string | null
  state: string | null
  wait_event_type: string | null
  wait_event: string | null
  backend_type: string | null
  database: string | null
  query_start: string | null
  xact_start: string | null
  duration_seconds: number
  blocked_by: number[]
  query: string
}

export type ActivityLock = {
  pid: number | null
  locktype: string | null
  mode: string | null
  granted: boolean
  relation_name: string | null
  relkind: string | null
  transaction_id: string | null
  virtualxid: string | null
  virtualtransaction: string | null
  user: string | null
  application_name: string | null
  state: string | null
  query: string | null
}

export type ActivityStatement = {
  queryid: string | null
  query: string
  calls: number
  total_exec_time_ms: number
  mean_exec_time_ms: number
  min_exec_time_ms: number
  max_exec_time_ms: number
  rows: number
  shared_blks_hit: number
  shared_blks_read: number
}

export type StatementsOrderBy = 'total' | 'mean' | 'calls'

export type SessionsResponse = { sessions: ActivitySession[]; fetchedAt: string }
export type LocksResponse = { locks: ActivityLock[]; fetchedAt: string }
export type StatementsResponse = {
  installed: boolean
  statements: ActivityStatement[]
  fetchedAt: string
}

function withConnection(path: string, connectionName: string) {
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}connectionName=${encodeURIComponent(connectionName)}`
}

export function fetchSessions(connectionName: string) {
  return fetchJson<SessionsResponse>(withConnection('/api/activity/sessions', connectionName))
}

export function fetchLocks(connectionName: string) {
  return fetchJson<LocksResponse>(withConnection('/api/activity/locks', connectionName))
}

export function fetchStatements(connectionName: string, orderBy: StatementsOrderBy) {
  return fetchJson<StatementsResponse>(
    withConnection(`/api/activity/statements?orderBy=${orderBy}`, connectionName)
  )
}

export function statementsAction(input: { action: 'install' | 'reset'; connectionName: string }) {
  return fetchJson<{ ok: boolean }>(withConnection('/api/activity/statements', input.connectionName), {
    method: 'POST',
    body: JSON.stringify({ action: input.action }),
  })
}

export function controlBackend(input: {
  pid: number
  action: 'cancel' | 'terminate'
  connectionName: string
}) {
  return fetchJson<{ ok: boolean; success: boolean }>('/api/activity/control', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
