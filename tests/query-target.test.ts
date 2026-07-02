import { describe, expect, it } from 'vitest'
import { extractPrimaryTableTarget } from '../lib/db/query'

describe('extractPrimaryTableTarget', () => {
  it('extracts a direct select table target', async () => {
    await expect(extractPrimaryTableTarget('select * from public.orders')).resolves.toEqual({
      schema: 'public',
      table: 'orders',
    })
  })

  it('does not treat a CTE name as a table target', async () => {
    const sql = `
      with recent_orders as (
        select * from public.orders
      )
      select * from recent_orders
    `

    await expect(extractPrimaryTableTarget(sql)).resolves.toBeNull()
  })

  it('still extracts schema-qualified tables that share a CTE name', async () => {
    const sql = `
      with orders as (
        select 1 as id
      )
      select * from public.orders
    `

    await expect(extractPrimaryTableTarget(sql)).resolves.toEqual({
      schema: 'public',
      table: 'orders',
    })
  })
})
