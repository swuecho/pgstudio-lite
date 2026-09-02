import pg from 'pg'

const { Pool } = pg
export type PgPool = InstanceType<typeof Pool>
export type PoolClient = Awaited<ReturnType<PgPool['connect']>>

const connectionPools = new Map<string, PgPool>()

export function getPool(connectionString: string) {
  const existing = connectionPools.get(connectionString)
  if (existing) return existing
  const pool = new Pool({ connectionString })
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
