/** Lexical statement boundaries for editor execution, including incomplete SQL. */
export function sqlStatementRanges(sql: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []
  let start = 0
  let quote = ''
  let dollar = ''
  let blockDepth = 0
  let lineComment = false
  let escapeString = false
  let hasCode = false
  let previousWord = ''
  const bodyBlocks: string[] = []
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]
    const next = sql[i + 1]
    if (lineComment) {
      if (c === '\n') lineComment = false
      continue
    }
    if (blockDepth) {
      if (c === '/' && next === '*') {
        blockDepth++
        i++
      } else if (c === '*' && next === '/') {
        blockDepth--
        i++
      }
      continue
    }
    if (dollar) {
      if (sql.startsWith(dollar, i)) {
        i += dollar.length - 1
        dollar = ''
      }
      continue
    }
    if (quote) {
      if (escapeString && c === '\\') {
        i++
        continue
      }
      if (c === quote) {
        if (next === quote) i++
        else quote = ''
      }
      continue
    }
    if (c === '-' && next === '-') {
      lineComment = true
      i++
      continue
    }
    if (c === '/' && next === '*') {
      blockDepth = 1
      i++
      continue
    }
    if (c === ';' && bodyBlocks.length === 0) {
      if (hasCode) ranges.push({ start, end: i + 1 })
      start = i + 1
      hasCode = false
      continue
    }
    if (!/\s/.test(c)) hasCode = true
    if (c === "'" || c === '"') {
      quote = c
      escapeString = c === "'" && /(?:^|[^\w$])[eE]$/.test(sql.slice(0, i))
    } else if (/[A-Za-z_]/.test(c)) {
      const word = sql.slice(i).match(/^[A-Za-z_][A-Za-z_0-9$]*/)![0]
      const keyword = word.toLowerCase()
      if (keyword === 'atomic' && previousWord === 'begin') bodyBlocks.push('atomic')
      else if (keyword === 'case' && bodyBlocks.length) bodyBlocks.push('case')
      else if (keyword === 'end' && bodyBlocks.length) bodyBlocks.pop()
      previousWord = keyword
      i += word.length - 1
    } else if (c === '$' && (i === 0 || !/[\w$]/.test(sql[i - 1]))) {
      const match = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)
      if (match) {
        dollar = match[0]
        i += dollar.length - 1
      }
    }
  }
  if (hasCode) ranges.push({ start, end: sql.length })
  return ranges
}

export function currentStatementRange(sql: string, offset: number) {
  const ranges = sqlStatementRanges(sql)
  return (
    ranges.find((range) => offset >= range.start && offset < range.end) ??
    (offset === sql.length ? ranges.at(-1) : undefined) ??
    null
  )
}
