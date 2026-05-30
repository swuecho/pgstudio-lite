import { describe, expect, it } from 'vitest'
import { copyableCellDisplayProps, formatUuidDisplay, looksLikeUuid } from '../lib/format-uuid-display'

describe('formatUuidDisplay', () => {
  it('returns the first segment of a standard UUID', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    expect(formatUuidDisplay(uuid)).toBe('550e8400')
  })

  it('detects UUID-shaped strings', () => {
    expect(looksLikeUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(looksLikeUuid('not-a-uuid')).toBe(false)
  })

  it('shortens by column type or UUID shape', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    expect(copyableCellDisplayProps(uuid, { dataType: 'uuid' })).toEqual({
      text: uuid,
      displayText: '550e8400',
    })
    expect(copyableCellDisplayProps(uuid)).toEqual({
      text: uuid,
      displayText: '550e8400',
    })
    expect(copyableCellDisplayProps('hello')).toEqual({ text: 'hello' })
  })
})
