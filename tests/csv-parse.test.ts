import { describe, expect, it } from 'vitest'
import { parseCsv } from '../lib/csv-parse'

describe('parseCsv', () => {
  it('parses a simple table with a header row', () => {
    const { headers, rows } = parseCsv('a,b,c\n1,2,3\n4,5,6')
    expect(headers).toEqual(['a', 'b', 'c'])
    expect(rows).toEqual([
      ['1', '2', '3'],
      ['4', '5', '6'],
    ])
  })

  it('handles quoted fields with embedded commas and newlines', () => {
    const { headers, rows } = parseCsv('name,note\n"Smith, John","line1\nline2"')
    expect(headers).toEqual(['name', 'note'])
    expect(rows).toEqual([['Smith, John', 'line1\nline2']])
  })

  it('unescapes doubled quotes', () => {
    const { rows } = parseCsv('x\n"she said ""hi"""')
    expect(rows).toEqual([['she said "hi"']])
  })

  it('handles CRLF line endings and a trailing newline', () => {
    const { headers, rows } = parseCsv('a,b\r\n1,2\r\n')
    expect(headers).toEqual(['a', 'b'])
    expect(rows).toEqual([['1', '2']])
  })

  it('preserves empty fields', () => {
    const { rows } = parseCsv('a,b,c\n1,,3')
    expect(rows).toEqual([['1', '', '3']])
  })

  it('returns empty result for blank input', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] })
  })
})
