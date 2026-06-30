import { describe, expect, it } from 'vitest'
import { pickForeignKeyLabelColumn, type TableColumn } from '../lib/db/tables'

function columns(names: Array<[string, string]>): TableColumn[] {
  return names.map(([name, dataType]) => ({
    name,
    dataType,
    isNullable: true,
    isIdentity: false,
    isPrimaryKey: false,
    hasDefault: false,
  }))
}

describe('pickForeignKeyLabelColumn', () => {
  it('prefers display names over earlier generic text columns', () => {
    expect(
      pickForeignKeyLabelColumn(
        columns([
          ['id', 'uuid'],
          ['notes', 'text'],
          ['display_name', 'text'],
          ['email', 'text'],
        ]),
        'id'
      )
    ).toBe('display_name')
  })

  it('ranks common identity columns before title and slug', () => {
    expect(
      pickForeignKeyLabelColumn(
        columns([
          ['id', 'uuid'],
          ['slug', 'text'],
          ['title', 'text'],
          ['username', 'text'],
          ['email', 'text'],
        ]),
        'id'
      )
    ).toBe('email')
  })

  it('ignores the FK value column even when it is text-like', () => {
    expect(
      pickForeignKeyLabelColumn(
        columns([
          ['code', 'text'],
          ['title', 'text'],
        ]),
        'code'
      )
    ).toBe('title')
  })

  it('falls back to the first text-like non-key column', () => {
    expect(
      pickForeignKeyLabelColumn(
        columns([
          ['id', 'uuid'],
          ['metadata', 'jsonb'],
          ['notes', 'text'],
          ['subtitle', 'varchar'],
        ]),
        'id'
      )
    ).toBe('notes')
  })

  it('returns undefined when no label-like column exists', () => {
    expect(
      pickForeignKeyLabelColumn(
        columns([
          ['id', 'uuid'],
          ['created_at', 'timestamp with time zone'],
        ]),
        'id'
      )
    ).toBeUndefined()
  })
})
