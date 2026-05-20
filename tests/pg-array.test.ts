import { describe, expect, it } from 'vitest'
import { parsePgStringArray } from '../lib/pg-array'

describe('parsePgStringArray', () => {
  it('passes through arrays', () => {
    expect(parsePgStringArray(['id', 'tenant_id'])).toEqual(['id', 'tenant_id'])
  })

  it('parses PostgreSQL text array literals', () => {
    expect(parsePgStringArray('{organization_id}')).toEqual(['organization_id'])
    expect(parsePgStringArray('{order_id,tenant_id}')).toEqual(['order_id', 'tenant_id'])
    expect(parsePgStringArray('{}')).toEqual([])
  })

  it('parses JSON array strings', () => {
    expect(parsePgStringArray('["organization_id"]')).toEqual(['organization_id'])
  })
})
