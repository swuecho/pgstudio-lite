import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closePool, executeQuery, getConnections, listTables, withClient } from '../lib/db'

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

  it('stops reading a large SELECT at the row limit', async () => {
    const started = Date.now()
    const result = await executeQuery({
      query: 'select g from generate_series(1, 5000000) g',
      connectionName: 'default',
      rowLimit: 10,
    })
    expect(result.statements[0]).toMatchObject({
      command: 'SELECT',
      rowCount: 10,
      rowCountExact: false,
      returnedRowCount: 10,
      truncated: true,
    })
    expect(result.statements[0]?.rows.map((row) => row.g)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    // Five million rows buffered would take seconds; a cursor stops at eleven.
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('keeps an exact count for a SELECT that fits, and binds parameters through the cursor', async () => {
    const result = await executeQuery({
      query: 'select g + $1::int as n from generate_series(1, 10) g',
      values: [100],
      connectionName: 'default',
      rowLimit: 10,
    })
    expect(result.statements[0]).toMatchObject({ rowCount: 10, rowCountExact: true, truncated: false })
    expect(result.statements[0]?.rows[0]).toEqual({ n: 101 })
  })

  it('leaves the pooled connection usable after a SELECT fails mid-cursor', async () => {
    await expect(
      executeQuery({ query: 'select 1 / (g - 3) from generate_series(1, 5) g', connectionName: 'default' })
    ).rejects.toMatchObject({ code: '22012' })
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await executeQuery({ query: 'select 42 as answer', connectionName: 'default' })
      expect(result.statements[0]?.rows[0]).toEqual({ answer: 42 })
    }
  })

  it('reads data-modifying statements in full with their exact count', async () => {
    const result = await executeQuery({
      query: 'insert into public.pgstudio_ci_probe select g from generate_series(1, 600) g returning id',
      connectionName: 'default',
    })
    expect(result.statements[0]).toMatchObject({
      command: 'INSERT',
      rowCount: 600,
      rowCountExact: true,
      returnedRowCount: 500,
      truncated: true,
    })
  })

  it('returns date and timestamp values as Postgres prints them', async () => {
    const result = await executeQuery({
      query: `select date '2024-01-15' as d,
        timestamp '2024-01-15 10:30:00.25' as ts,
        timestamptz '2024-01-15 10:30:00+00' at time zone 'UTC' as ts_utc,
        array[date '2024-01-15', null] as ds`,
      connectionName: 'default',
    })
    expect(result.statements[0]?.rows[0]).toEqual({
      d: '2024-01-15',
      ts: '2024-01-15 10:30:00.25',
      ts_utc: '2024-01-15 10:30:00',
      ds: ['2024-01-15', null],
    })
  })

  it('caps every pooled statement, and the SQL editor restores the cap after its run', async () => {
    await executeQuery({ query: 'select 1', connectionName: 'default' })
    const timeout = await withClient('default', async (client) => {
      const { rows } = await client.query('show statement_timeout')
      return rows[0].statement_timeout
    })
    expect(timeout).toBe('30s')
  })
})
