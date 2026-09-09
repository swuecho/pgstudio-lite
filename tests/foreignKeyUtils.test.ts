import { describe, expect, it } from 'vitest'
import {
  buildForeignKeyMatch,
  buildForeignKeyTableEditorHref,
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

  it('builds a table-editor href filtered to the referenced key', () => {
    expect(
      buildForeignKeyTableEditorHref({ connectionName: 'local', foreignKey: singleFk, match: { id: 42 } })
    ).toEqual({
      pathname: '/table-editor',
      query: {
        connectionName: 'local',
        schema: 'public',
        table: 'users',
        filterColumn: 'id',
        filterMode: 'equals',
        filterValue: '42',
      },
    })
  })

  it('filters composite keys on the first referenced column', () => {
    const href = buildForeignKeyTableEditorHref({
      connectionName: 'local',
      foreignKey: compositeFk,
      match: { id: 7, tenant_id: 't1' },
    })
    expect(href.query).toMatchObject({ table: 'orders', filterColumn: 'id', filterValue: '7' })
  })

  it('formats target and header labels', () => {
    expect(formatForeignKeyTarget(singleFk)).toBe('users')
    expect(formatForeignKeyHeaderTitle(singleFk)).toBe('References users (id)')
    expect(formatForeignKeyTarget({ ...singleFk, referencedSchema: 'app', referencedTable: 'users' })).toBe(
      'app.users'
    )
  })
})
