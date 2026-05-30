import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closePool, executeQuery, getConnections, listTables } from '../lib/db'

/**
 * Real Postgres smoke tests. Skipped unless both env vars are set (see CONTRIBUTING.md).
 * CI sets these in the `pg-integration` workflow job.
 */
const integrationEnabled = Boolean(
  process.env.PGSTUDIO_PG_INTEGRATION?.trim() && process.env.PG_CONNECTION_STRING?.trim()
)

describe.runIf(integrationEnabled)('PostgreSQL integration', () => {
  beforeAll(async () => {
    await executeQuery({
      query: 'create table if not exists public.pgstudio_ci_probe (id integer primary key)',
      connectionName: 'default',
    })
  })

  afterAll(async () => {
    try {
      await executeQuery({
        query: 'drop table if exists public.pgstudio_ci_probe',
        connectionName: 'default',
      })
    } catch {
      // Best-effort cleanup; pool shutdown still runs below.
    }
    for (const connection of getConnections()) {
      closePool(connection.connectionString)
    }
  })

  it('runs a simple select against the seeded connection', async () => {
    const result = await executeQuery({ query: "select 'ok' as status", connectionName: 'default' })
    expect(result.status).toBe('success')
    expect(result.statements).toHaveLength(1)
    expect(result.statements[0]?.rows[0]).toMatchObject({ status: 'ok' })
  })

  it('runs multiple statements in one request', async () => {
    const result = await executeQuery({ query: 'select 1 as a; select 2 as b', connectionName: 'default' })
    expect(result.status).toBe('success')
    expect(result.statements).toHaveLength(2)
    expect(result.statements[0]?.rows[0]).toMatchObject({ a: 1 })
    expect(result.statements[1]?.rows[0]).toMatchObject({ b: 2 })
  })

  it('lists relations from Postgres (smoke)', async () => {
    const { tables, truncated } = await listTables('default')
    expect(truncated).toBe(false)
    expect(tables.some((t) => t.schema === 'public' && t.table === 'pgstudio_ci_probe')).toBe(true)
  })
})
