import { describe, expect, it } from 'vitest'
import { canOpenCellViewer, formatCellContentForView } from '../lib/format-cell-content'

describe('formatCellContentForView', () => {
  it('pretty-prints json values', () => {
    expect(formatCellContentForView({ a: 1 }, 'jsonb')).toBe('{\n  "a": 1\n}')
  })

  it('formats plain text as-is', () => {
    expect(formatCellContentForView('hello world', 'text')).toBe('hello world')
  })

  it('allows viewing text and json columns and long values', () => {
    expect(canOpenCellViewer('text', 'short')).toBe(true)
    expect(canOpenCellViewer('jsonb', '{}')).toBe(true)
    expect(canOpenCellViewer('int4', 1)).toBe(false)
    expect(canOpenCellViewer('int4', 'x'.repeat(120))).toBe(true)
  })
})
