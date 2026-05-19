export function detectOS() {
  if (typeof navigator === 'undefined') return 'linux'
  const platform = navigator.platform.toLowerCase()
  if (platform.includes('mac')) return 'macos'
  if (platform.includes('win')) return 'windows'
  return 'linux'
}

export function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function formatCell(value: unknown) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function getCurrentTheme() {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function checkIfAppendLimitRequired(sql: string, limit = 0) {
  const cleanedSql = sql.trim().replaceAll('\n', ' ').replaceAll(/\s+/g, ' ')
  const regMatch = cleanedSql.matchAll(/[a-zA-Z]*[0-9]*[;]+/g)
  const queries = [...regMatch]
  const indexSemiColon = cleanedSql.lastIndexOf(';')
  const hasComments = cleanedSql.includes('--')
  const hasMultipleQueries =
    queries.length > 1 || (indexSemiColon > 0 && indexSemiColon !== cleanedSql.length - 1)

  const appendAutoLimit =
    limit > 0 &&
    !hasComments &&
    !hasMultipleQueries &&
    cleanedSql.toLowerCase().startsWith('select') &&
    !cleanedSql.toLowerCase().match(/fetch\s+first/i) &&
    !cleanedSql.match(/limit$/i) &&
    !cleanedSql.match(/limit;$/i) &&
    !cleanedSql.match(/limit [0-9]* offset [0-9]*[;]?$/i) &&
    !cleanedSql.match(/limit [0-9]*[;]?$/i)

  return { cleanedSql, appendAutoLimit }
}

export function suffixWithLimit(sql: string, limit = 0) {
  const { appendAutoLimit } = checkIfAppendLimitRequired(sql, limit)
  if (!appendAutoLimit) return sql
  const trimmedSql = sql.trimEnd()
  return trimmedSql.endsWith(';')
    ? trimmedSql.replace(/[;]+$/, ` limit ${limit};`)
    : `${trimmedSql} limit ${limit};`
}

export function buildExplainQuery(sql: string, readOnly: boolean) {
  const trimmed = sql.trim().replace(/;+\s*$/, '')
  const options = readOnly ? 'FORMAT JSON' : 'ANALYZE, BUFFERS, FORMAT JSON'
  return `EXPLAIN (${options}) ${trimmed}`
}

export function formatExplainPlan(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') {
    try {
      return `${JSON.stringify(JSON.parse(value), null, 2)}\n`
    } catch {
      return value
    }
  }
  if (typeof value === 'object') {
    return `${JSON.stringify(value, null, 2)}\n`
  }
  return String(value)
}
