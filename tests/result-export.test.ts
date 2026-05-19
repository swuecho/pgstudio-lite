import { describe, expect, it } from 'vitest'
import { escapeCsvCell, rowsToCsv, rowsToJson, rowsToTsv } from '../lib/result-export'

describe('result-export', () => {
  const fields = ['id', 'name']
  const rows = [
    { id: 1, name: 'alice' },
    { id: 2, name: 'bob, jr' },
  ]
  const formatCell = (value: unknown) => (value === null || value === undefined ? 'NULL' : String(value))

  it('escapes csv cells with commas and quotes', () => {
    expect(escapeCsvCell('plain')).toBe('plain')
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""')
  })

  it('builds csv with header', () => {
    expect(rowsToCsv(fields, rows, formatCell)).toBe('id,name\n1,alice\n2,"bob, jr"')
  })

  it('builds tsv', () => {
    expect(rowsToTsv(fields, rows, formatCell)).toBe('id\tname\n1\talice\n2\tbob, jr')
  })

  it('builds json array', () => {
    expect(rowsToJson(fields, rows)).toBe(
      `${JSON.stringify(
        [
          { id: 1, name: 'alice' },
          { id: 2, name: 'bob, jr' },
        ],
        null,
        2
      )}\n`
    )
  })
})
