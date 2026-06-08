export type ParsedCsv = {
  headers: string[]
  rows: string[][]
}

/**
 * Minimal RFC 4180 CSV parser: handles quoted fields, escaped quotes (""),
 * embedded commas/newlines, and both LF and CRLF line endings. The first
 * non-empty record is treated as the header row.
 */
export function parseCsv(input: string): ParsedCsv {
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false
  let started = false

  const pushField = () => {
    record.push(field)
    field = ''
  }
  const pushRecord = () => {
    pushField()
    records.push(record)
    record = []
    started = false
  }

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      started = true
    } else if (char === ',') {
      pushField()
      started = true
    } else if (char === '\r') {
      if (input[i + 1] === '\n') i += 1
      pushRecord()
    } else if (char === '\n') {
      pushRecord()
    } else {
      field += char
      started = true
    }
  }

  // Flush trailing field/record if the file didn't end with a newline.
  if (started || field !== '' || record.length > 0) {
    pushRecord()
  }

  // Drop fully-empty trailing records (e.g. a final blank line).
  const nonEmpty = records.filter((r) => !(r.length === 1 && r[0] === ''))
  if (nonEmpty.length === 0) return { headers: [], rows: [] }

  const [headers, ...rows] = nonEmpty
  return { headers, rows }
}
