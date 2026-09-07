export type StatementRange = { start: number; end: number }

// Sticky regexes scan from `lastIndex` without slicing the SQL, keeping the pass linear.
const WORD_RE = /[A-Za-z_][A-Za-z_0-9$]*/y
const DOLLAR_TAG_RE = /\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/y
const IDENTIFIER_CHAR_RE = /[\w$]/
const WHITESPACE_RE = /\s/

/** True when the quote at `index` is preceded by a standalone `E`/`e` (escape string literal). */
function isEscapeStringPrefix(sql: string, index: number): boolean {
  const prefix = sql[index - 1]
  if (prefix !== 'e' && prefix !== 'E') return false
  return index < 2 || !IDENTIFIER_CHAR_RE.test(sql[index - 2])
}

/** Lexical statement boundaries for editor execution, including incomplete SQL. */
export function sqlStatementRanges(sql: string): StatementRange[] {
  const ranges: StatementRange[] = []
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
    if (!WHITESPACE_RE.test(c)) hasCode = true
    if (c === "'" || c === '"') {
      quote = c
      escapeString = c === "'" && isEscapeStringPrefix(sql, i)
    } else if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_') {
      WORD_RE.lastIndex = i
      const word = WORD_RE.exec(sql)![0]
      const keyword = word.toLowerCase()
      if (keyword === 'atomic' && previousWord === 'begin') bodyBlocks.push('atomic')
      else if (keyword === 'case' && bodyBlocks.length) bodyBlocks.push('case')
      else if (keyword === 'end' && bodyBlocks.length) bodyBlocks.pop()
      previousWord = keyword
      i += word.length - 1
    } else if (c === '$' && (i === 0 || !IDENTIFIER_CHAR_RE.test(sql[i - 1]))) {
      DOLLAR_TAG_RE.lastIndex = i
      const match = DOLLAR_TAG_RE.exec(sql)
      if (match) {
        dollar = match[0]
        i += dollar.length - 1
      }
    }
  }
  if (hasCode) ranges.push({ start, end: sql.length })
  return ranges
}

/**
 * The statement containing `offset` from a precomputed `sqlStatementRanges` result.
 * A cursor at the very end of the text belongs to the last statement.
 */
export function statementRangeAt(
  ranges: StatementRange[],
  offset: number,
  sqlLength: number
): StatementRange | null {
  return (
    ranges.find((range) => offset >= range.start && offset < range.end) ??
    (offset === sqlLength ? ranges.at(-1) : undefined) ??
    null
  )
}

export function currentStatementRange(sql: string, offset: number) {
  return statementRangeAt(sqlStatementRanges(sql), offset, sql.length)
}
