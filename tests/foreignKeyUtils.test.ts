import { describe, expect, it } from 'vitest'
import {
  buildForeignKeyMatch,
  formatForeignKeyHeaderTitle,
  formatForeignKeyTarget,
} from '../components/table-editor/foreignKeyUtils'
import type { ColumnForeignKey } from '../components/table-editor/types'

const singleFk: ColumnForeignKey = {
  constraintName: 'orders_user_id_fkey',
  referencedSchema: 'public',
  referencedTable: 'users',
  referencedColumn: 'id',
  constraintColumns: ['user_id'],
  constraintReferencedColumns: ['id'],
}

const compositeFk: ColumnForeignKey = {
  constraintName: 'line_items_order_fkey',
  referencedSchema: 'public',
  referencedTable: 'orders',
  referencedColumn: 'id',
  constraintColumns: ['order_id', 'tenant_id'],
  constraintReferencedColumns: ['id', 'tenant_id'],
}

describe('foreignKeyUtils', () => {
  it('builds a single-column match', () => {
    expect(buildForeignKeyMatch({ user_id: 42 }, singleFk)).toEqual({ id: 42 })
  })

  it('returns null when any composite part is null', () => {
    expect(buildForeignKeyMatch({ order_id: 1, tenant_id: null }, compositeFk)).toBeNull()
  })

  it('builds a composite match', () => {
    expect(buildForeignKeyMatch({ order_id: 1, tenant_id: 't1' }, compositeFk)).toEqual({
      id: 1,
      tenant_id: 't1',
    })
  })

  it('formats target and header labels', () => {
    expect(formatForeignKeyTarget(singleFk)).toBe('users')
    expect(formatForeignKeyHeaderTitle(singleFk)).toBe('References users (id)')
    expect(formatForeignKeyTarget({ ...singleFk, referencedSchema: 'app', referencedTable: 'users' })).toBe(
      'app.users'
    )
  })
})
