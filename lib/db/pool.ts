import pg from 'pg'

const { Pool } = pg
export type PgPool = InstanceType<typeof Pool>
export type PoolClient = Awaited<ReturnType<PgPool['connect']>>

/**
 * Upper bound on any one statement from a pooled connection: table browsing,
 * row edits, trace, activity, imports. The SQL editor sets its own, shorter
 * limit per run (lib/db/query.ts) and restores this one afterwards.
 *
 * Set as a session setting when each connection opens, not as a startup
 * parameter: PgBouncer refuses unknown startup parameters.
 */
export const POOL_STATEMENT_TIMEOUT_MS = 30_000

// date, timestamp, timestamptz, and their arrays.
const DATE_TIME_OIDS = new Set([1082, 1114, 1184])
const DATE_TIME_ARRAY_OIDS = new Set([1182, 1115, 1185])
const identity = (value: string) => value

/**
 * Type parsers for every pooled query (and for cursors, which take their own;
 * see lib/db/capped-query.ts).
 *
 * node-postgres turns date and timestamp values into JS `Date`s in the server
 * process's time zone, which then serialise to UTC ISO strings: a `date` of
 * 2024-01-15 reaches the browser as `2024-01-14T16:00:00.000Z` east of UTC,
 * and a `timestamp` loses its wall-clock reading. Keeping Postgres's own text
 * (`2024-01-15`, `2024-01-15 10:00:00`, `2024-01-15 10:00:00+08`) is exact and
 * matches psql; the UI formats it from there (components/table-editor/gridCellValues.ts).
 */
export const pgTypes = {
  getTypeParser(oid: number, format?: 'text' | 'binary'): (value: string) => unknown {
    if (format !== 'binary') {
      if (DATE_TIME_OIDS.has(oid)) return identity
      // text[] parser: the same array syntax, elements left as strings.
      if (DATE_TIME_ARRAY_OIDS.has(oid)) return pg.types.getTypeParser(1009, 'text')
    }
    return pg.types.getTypeParser(oid, format)
  },
}

const connectionPools = new Map<string, PgPool>()

export function getPool(connectionString: string) {
  const existing = connectionPools.get(connectionString)
  if (existing) return existing
  const pool = new Pool({ connectionString, types: pgTypes })
  // Queued ahead of whatever the borrower runs first, so it always applies.
  pool.on('connect', (client: PoolClient) => {
    client.query(`set statement_timeout = ${POOL_STATEMENT_TIMEOUT_MS}`).catch(() => {
      // A server that refuses it still serves queries, just without the cap.
    })
  })
  connectionPools.set(connectionString, pool)
  return pool
}

export function closePool(connectionString: string) {
  const pool = connectionPools.get(connectionString)
  if (!pool) return
  connectionPools.delete(connectionString)
  void pool.end().catch(() => {
    // Swallow pool shutdown errors during lifecycle cleanup.
  })
}

/**
 * Drain every pool. Used by the desktop app's shutdown path so Postgres
 * connections are closed before the process exits rather than being severed.
 */
export async function closeAllPools() {
  const pools = [...connectionPools.values()]
  connectionPools.clear()
  await Promise.allSettled(pools.map((pool) => pool.end()))
}
