import { describe, expect, it, vi } from 'vitest'
import { isForeignKeyJumpClick, jumpToReferencedRow } from '../components/table-editor/foreignKeyJump'

const routerPush = vi.fn()
vi.mock('next/router', () => ({
  default: { push: (...args: unknown[]) => routerPush(...args) },
}))

describe('foreignKeyJump', () => {
  it('recognises ⌘/Ctrl + primary-button clicks only', () => {
    expect(isForeignKeyJumpClick({ metaKey: true, ctrlKey: false, button: 0 })).toBe(true)
    expect(isForeignKeyJumpClick({ metaKey: false, ctrlKey: true, button: 0 })).toBe(true)
    expect(isForeignKeyJumpClick({ metaKey: false, ctrlKey: false, button: 0 })).toBe(false)
    expect(isForeignKeyJumpClick({ metaKey: true, ctrlKey: false, button: 2 })).toBe(false)
    expect(isForeignKeyJumpClick({ metaKey: true, ctrlKey: false })).toBe(true)
  })

  it('pushes the referenced-row table-editor route', () => {
    jumpToReferencedRow({
      connectionName: 'local',
      foreignKey: {
        constraintName: 'orders_user_id_fkey',
        referencedSchema: 'app',
        referencedTable: 'users',
        referencedColumn: 'id',
        constraintColumns: ['user_id'],
        constraintReferencedColumns: ['id'],
      },
      match: { id: 9 },
    })
    expect(routerPush).toHaveBeenCalledWith({
      pathname: '/table-editor',
      query: {
        connectionName: 'local',
        schema: 'app',
        table: 'users',
        filterColumn: 'id',
        filterMode: 'equals',
        filterValue: '9',
      },
    })
  })
})
