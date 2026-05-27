import { getConnectionByName } from './connections'
import { withClient } from './client'

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

export type ActivityStatementsResult = {
  installed: boolean
  statements: ActivityStatement[]
}

export async function getActivitySessions(connectionName?: string): Promise<ActivitySession[]> {
  return withClient(connectionName, async (client) => {
    const sql = `
      select
        a.pid,
        a.usename                     as user,
        a.application_name,
        a.client_addr::text           as client_addr,
        a.state,
        a.wait_event_type,
        a.wait_event,
        a.backend_type,
        a.datname                     as database,
        a.xact_start,
        a.query_start,
        extract(epoch from (now() - coalesce(a.query_start, a.xact_start, a.backend_start)))::float as duration_seconds,
        coalesce(pg_blocking_pids(a.pid), '{}') as blocked_by,
        a.query
      from pg_stat_activity a
      where a.pid <> pg_backend_pid()
        and a.backend_type = 'client backend'
      order by
        (coalesce(array_length(pg_blocking_pids(a.pid), 1), 0) > 0) desc,
        a.query_start asc nulls last
    `
    const { rows } = await client.query(sql)
    return rows.map((row: Record<string, unknown>) => ({
      pid: Number(row.pid),
      user: row.user == null ? null : String(row.user),
      application_name: row.application_name == null ? null : String(row.application_name),
      client_addr: row.client_addr == null ? null : String(row.client_addr),
      state: row.state == null ? null : String(row.state),
      wait_event_type: row.wait_event_type == null ? null : String(row.wait_event_type),
      wait_event: row.wait_event == null ? null : String(row.wait_event),
      backend_type: row.backend_type == null ? null : String(row.backend_type),
      database: row.database == null ? null : String(row.database),
      query_start: row.query_start == null ? null : new Date(row.query_start as string | Date).toISOString(),
      xact_start: row.xact_start == null ? null : new Date(row.xact_start as string | Date).toISOString(),
      duration_seconds: Number(row.duration_seconds || 0),
      blocked_by: Array.isArray(row.blocked_by)
        ? (row.blocked_by as unknown[]).map((value) => Number(value))
        : [],
      query: row.query == null ? '' : String(row.query),
    }))
  })
}

export async function getActivityLocks(connectionName?: string): Promise<ActivityLock[]> {
  return withClient(connectionName, async (client) => {
    const sql = `
      select
        l.pid,
        l.locktype,
        l.mode,
        l.granted,
        case when c.oid is null then null else n.nspname || '.' || c.relname end as relation_name,
        c.relkind                     as relkind,
        l.transactionid::text         as transaction_id,
        l.virtualxid,
        l.virtualtransaction,
        a.usename                     as user,
        a.application_name,
        a.state,
        a.query
      from pg_locks l
      left join pg_class c     on c.oid = l.relation
      left join pg_namespace n on n.oid = c.relnamespace
      left join pg_stat_activity a on a.pid = l.pid
      where l.pid is null or l.pid <> pg_backend_pid()
      order by l.granted asc, l.pid nulls last
    `
    const { rows } = await client.query(sql)
    return rows.map((row: Record<string, unknown>) => ({
      pid: row.pid == null ? null : Number(row.pid),
      locktype: row.locktype == null ? null : String(row.locktype),
      mode: row.mode == null ? null : String(row.mode),
      granted: row.granted === true,
      relation_name: row.relation_name == null ? null : String(row.relation_name),
      relkind: row.relkind == null ? null : String(row.relkind),
      transaction_id: row.transaction_id == null ? null : String(row.transaction_id),
      virtualxid: row.virtualxid == null ? null : String(row.virtualxid),
      virtualtransaction: row.virtualtransaction == null ? null : String(row.virtualtransaction),
      user: row.user == null ? null : String(row.user),
      application_name: row.application_name == null ? null : String(row.application_name),
      state: row.state == null ? null : String(row.state),
      query: row.query == null ? null : String(row.query),
    }))
  })
}

export async function getActivityStatements(
  connectionName?: string,
  options: { limit?: number; orderBy?: 'total' | 'mean' | 'calls' } = {}
): Promise<ActivityStatementsResult> {
  const limit = Math.max(1, Math.min(500, Number(options.limit || 200)))
  const orderColumn =
    options.orderBy === 'mean' ? 'mean_exec_time' : options.orderBy === 'calls' ? 'calls' : 'total_exec_time'
  return withClient(connectionName, async (client) => {
    const ext = await client.query(`select 1 from pg_extension where extname = 'pg_stat_statements' limit 1`)
    if (ext.rows.length === 0) {
      return { installed: false, statements: [] }
    }
    const sql = `
      select
        queryid::text                 as queryid,
        query,
        calls,
        total_exec_time               as total_exec_time_ms,
        mean_exec_time                as mean_exec_time_ms,
        min_exec_time                 as min_exec_time_ms,
        max_exec_time                 as max_exec_time_ms,
        rows,
        shared_blks_hit,
        shared_blks_read
      from pg_stat_statements
      order by ${orderColumn} desc nulls last
      limit $1
    `
    const { rows } = await client.query(sql, [limit])
    const statements = rows.map((row: Record<string, unknown>) => ({
      queryid: row.queryid == null ? null : String(row.queryid),
      query: row.query == null ? '' : String(row.query),
      calls: Number(row.calls || 0),
      total_exec_time_ms: Number(row.total_exec_time_ms || 0),
      mean_exec_time_ms: Number(row.mean_exec_time_ms || 0),
      min_exec_time_ms: Number(row.min_exec_time_ms || 0),
      max_exec_time_ms: Number(row.max_exec_time_ms || 0),
      rows: Number(row.rows || 0),
      shared_blks_hit: Number(row.shared_blks_hit || 0),
      shared_blks_read: Number(row.shared_blks_read || 0),
    }))
    return { installed: true, statements }
  })
}

export async function installPgStatStatements(connectionName?: string): Promise<void> {
  const connection = getConnectionByName(connectionName)
  if (connection.readOnly) {
    const error = new Error(`Connection '${connection.name}' is read-only`) as Error & { statusCode?: number }
    error.statusCode = 403
    throw error
  }
  await withClient(connectionName, async (client) => {
    await client.query('create extension if not exists pg_stat_statements')
  })
}

export async function resetActivityStatements(connectionName?: string): Promise<void> {
  const connection = getConnectionByName(connectionName)
  if (connection.readOnly) {
    const error = new Error(`Connection '${connection.name}' is read-only`) as Error & { statusCode?: number }
    error.statusCode = 403
    throw error
  }
  await withClient(connectionName, async (client) => {
    await client.query('select pg_stat_statements_reset()')
  })
}

export async function controlBackend(
  connectionName: string | undefined,
  pid: number,
  action: 'cancel' | 'terminate'
): Promise<boolean> {
  const connection = getConnectionByName(connectionName)
  if (connection.readOnly) {
    const error = new Error(`Connection '${connection.name}' is read-only`) as Error & { statusCode?: number }
    error.statusCode = 403
    throw error
  }
  return withClient(connectionName, async (client) => {
    const fn = action === 'terminate' ? 'pg_terminate_backend' : 'pg_cancel_backend'
    const { rows } = await client.query(`select ${fn}($1) as success`, [pid])
    return rows[0]?.success === true
  })
}
