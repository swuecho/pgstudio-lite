import { describe, expect, it } from 'vitest'
import { narrowResultToSelectList } from '../lib/query-output-columns'

describe('narrowResultToSelectList', () => {
  it('drops extra pg columns when select list is explicit', () => {
    const pgFields = ['jikeyun_warehouse_name', 'current_quantity', 'id', 'created_at', 'updated_at']
    const rows = [
      {
        jikeyun_warehouse_name: 'WH-1',
        current_quantity: 10,
        id: 99,
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
      },
    ]

    const narrowed = narrowResultToSelectList(pgFields, rows, [
      'jikeyun_warehouse_name',
      'current_quantity',
    ])

    expect(narrowed.fields).toEqual(['jikeyun_warehouse_name', 'current_quantity'])
    expect(narrowed.rows[0]).toEqual({
      jikeyun_warehouse_name: 'WH-1',
      current_quantity: 10,
    })
  })

  it('keeps pg fields when select list is not narrower', () => {
    const pgFields = ['id', 'name']
    const rows = [{ id: 1, name: 'a' }]
    const narrowed = narrowResultToSelectList(pgFields, rows, ['id', 'name'])
    expect(narrowed).toEqual({ fields: pgFields, rows })
  })

  it('keeps pg fields when output columns are unknown', () => {
    const pgFields = ['id', 'name']
    const rows = [{ id: 1, name: 'a' }]
    expect(narrowResultToSelectList(pgFields, rows, null)).toEqual({ fields: pgFields, rows })
  })
})
