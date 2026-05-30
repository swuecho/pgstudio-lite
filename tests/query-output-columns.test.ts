import { describe, expect, it } from 'vitest'
import { extractSelectOutputColumnNames } from '../lib/query-output-columns'

describe('extractSelectOutputColumnNames', () => {
  it('extracts explicit select list from CTE query', async () => {
    const sql = `with warehouse_sku_total as (
select warehouse_id , sum(jikeyun_current_quantity ) as current_quantity from public.warehouse_skus 
group by warehouse_id )
select w.jikeyun_warehouse_name , wst.current_quantity 	from warehouse_sku_total wst 
inner join public.warehouses w on wst.warehouse_id = w.id`

    await expect(extractSelectOutputColumnNames(sql)).resolves.toEqual([
      'jikeyun_warehouse_name',
      'current_quantity',
    ])
  })

  it('returns null for select *', async () => {
    await expect(extractSelectOutputColumnNames('select * from public.warehouses')).resolves.toBeNull()
  })

  it('extracts aliased expressions', async () => {
    await expect(extractSelectOutputColumnNames('select count(*) as total from t')).resolves.toEqual([
      'total',
    ])
  })
})
