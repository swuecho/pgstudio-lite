import { describe, expect, it } from 'vitest'
import { buildTraceHref } from '../lib/trace-url'

describe('trace-url', () => {
  it('includes connection context in trace links', () => {
    expect(
      buildTraceHref({
        connectionName: 'staging',
        schema: 'public',
        table: 'orders',
        pk: { id: 42 },
      })
    ).toBe('/trace?connectionName=staging&schema=public&table=orders&pk=%7B%22id%22%3A42%7D')
  })

  it('preserves depth when rerooting trace nodes', () => {
    expect(
      buildTraceHref({
        connectionName: 'local',
        schema: 'app',
        table: 'users',
        pk: { tenant_id: 't1', id: 'u-1' },
        depth: 4,
      })
    ).toBe(
      '/trace?connectionName=local&schema=app&table=users&pk=%7B%22tenant_id%22%3A%22t1%22%2C%22id%22%3A%22u-1%22%7D&depth=4'
    )
  })
})
