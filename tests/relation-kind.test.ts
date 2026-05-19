import { describe, expect, it } from 'vitest'
import { isMutableRelationKind, mapPgRelkind, relationKindLabel } from '../lib/relation-kind'

describe('relation-kind', () => {
  it('maps pg relkind values', () => {
    expect(mapPgRelkind('r')).toBe('table')
    expect(mapPgRelkind('v')).toBe('view')
    expect(mapPgRelkind('m')).toBe('materialized_view')
  })

  it('labels relation kinds', () => {
    expect(relationKindLabel('view')).toBe('view')
    expect(relationKindLabel('materialized_view')).toBe('matview')
  })

  it('only tables are mutable', () => {
    expect(isMutableRelationKind('table')).toBe(true)
    expect(isMutableRelationKind('view')).toBe(false)
    expect(isMutableRelationKind('materialized_view')).toBe(false)
  })
})
