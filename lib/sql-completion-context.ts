export type TableRef = { schema: string; table: string }

export type SchemaTableRef = { schema: string; table: string }

export type DotCompletionContext =
  | { kind: 'alias'; alias: string; prefix: string }
  | { kind: 'qualifiedTable'; schema: string; table: string; prefix: string }

export type ClauseColumnContext = {
  clause: 'where' | 'select'
  prefix: string
}

export type ColumnCompletionItem = {
  name: string
  insertText: string
  detail: string
}

export function deriveTableAlias(tableName: string): string {
  const words = tableName.split('_').filter((word) => word.length > 0)
  if (words.length === 0) {
    const cleaned = tableName.replace(/[^a-zA-Z0-9]/g, '')
    return cleaned.slice(0, 1).toLowerCase() || 't'
  }
  return words.map((word) => word[0].toLowerCase()).join('')
}

export function resolveAvailableAlias(
  tableName: string,
  usedAliases: Iterable<string>
): string {
  const used = new Set([...usedAliases].map((alias) => alias.toLowerCase()))
  let base = deriveTableAlias(tableName)
  if (!base) base = 't'

  let candidate = base
  let suffix = 2
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}${suffix}`
    suffix += 1
  }
  return candidate
}

export function isFromJoinTableContext(textBeforeCursor: string): boolean {
  return (
    /\bfrom\s+[\w."]*$/i.test(textBeforeCursor) ||
    /\b\w*join\s+[\w."]*$/i.test(textBeforeCursor)
  )
}

export function getTextBeforeCursor(
  lines: string[],
  position: { lineNumber: number; column: number }
): string {
  const parts: string[] = []
  for (let i = 0; i < position.lineNumber - 1; i++) {
    parts.push(lines[i] ?? '')
    parts.push('\n')
  }
  const currentLine = lines[position.lineNumber - 1] ?? ''
  parts.push(currentLine.slice(0, Math.max(0, position.column - 1)))
  return parts.join('')
}

export function getDotCompletionContext(textBeforeCursor: string): DotCompletionContext | null {
  const qualifiedMatch = textBeforeCursor.match(/((?:[\w"]+\.)[\w"]+)\.([\w]*)$/)
  if (qualifiedMatch) {
    const segments = qualifiedMatch[1].replace(/"/g, '').split('.')
    if (segments.length >= 2) {
      const table = segments[segments.length - 1]
      const schema = segments[segments.length - 2]
      return {
        kind: 'qualifiedTable',
        schema,
        table,
        prefix: qualifiedMatch[2] ?? '',
      }
    }
  }

  const aliasMatch = textBeforeCursor.match(/([\w]+)\.([\w]*)$/)
  if (aliasMatch) {
    return {
      kind: 'alias',
      alias: aliasMatch[1],
      prefix: aliasMatch[2] ?? '',
    }
  }

  return null
}

function normalizeTableToken(raw: string): string {
  return raw.replace(/"/g, '').trim()
}

function resolveTableRef(
  raw: string,
  schemaTables: SchemaTableRef[]
): TableRef | null {
  const cleaned = normalizeTableToken(raw)
  if (!cleaned) return null

  if (cleaned.includes('.')) {
    const dotIndex = cleaned.lastIndexOf('.')
    return {
      schema: cleaned.slice(0, dotIndex),
      table: cleaned.slice(dotIndex + 1),
    }
  }

  const matches = schemaTables.filter((item) => item.table === cleaned)
  if (matches.length === 1) {
    return { schema: matches[0].schema, table: matches[0].table }
  }
  if (matches.length > 1) {
    const inPublic = matches.find((item) => item.schema === 'public')
    if (inPublic) return { schema: inPublic.schema, table: inPublic.table }
    return { schema: matches[0].schema, table: matches[0].table }
  }

  return { schema: 'public', table: cleaned }
}

function registerAlias(
  map: Record<string, TableRef>,
  alias: string,
  ref: TableRef
) {
  map[alias.toLowerCase()] = ref
}

export function buildAliasMap(
  sql: string,
  schemaTables: SchemaTableRef[]
): Record<string, TableRef> {
  const map: Record<string, TableRef> = {}

  const clauseRe =
    /(?:\bfrom\b|\b\w*join\b)\s+("(?:[^"]+)"|(?:[\w]+\.)?[\w]+)\s*(?:(?:as\s+)?([\w]+)|(?=\s|,|$|\n))/gi
  let match: RegExpExecArray | null
  while ((match = clauseRe.exec(sql)) !== null) {
    const ref = resolveTableRef(match[1], schemaTables)
    if (!ref) continue
    const alias = match[2]
    if (alias) {
      registerAlias(map, alias, ref)
    } else {
      registerAlias(map, ref.table, ref)
    }
  }

  const qualifiedAliasRe = /\b([\w]+\.[\w]+)\s+(?:as\s+)?([\w]+)\b/gi
  while ((match = qualifiedAliasRe.exec(sql)) !== null) {
    const ref = resolveTableRef(match[1], schemaTables)
    if (ref) registerAlias(map, match[2], ref)
  }

  return map
}

export function resolveTableForDotContext(
  dotContext: DotCompletionContext,
  sql: string,
  schemaTables: SchemaTableRef[]
): TableRef | null {
  if (dotContext.kind === 'qualifiedTable') {
    return { schema: dotContext.schema, table: dotContext.table }
  }

  const aliasMap = buildAliasMap(sql, schemaTables)
  return aliasMap[dotContext.alias.toLowerCase()] ?? null
}

export function getQueryTables(sql: string, schemaTables: SchemaTableRef[]): TableRef[] {
  const map = buildAliasMap(sql, schemaTables)
  const seen = new Set<string>()
  const tables: TableRef[] = []
  for (const ref of Object.values(map)) {
    const key = `${ref.schema}.${ref.table}`
    if (seen.has(key)) continue
    seen.add(key)
    tables.push(ref)
  }
  return tables
}

function getSelectListPrefix(textBeforeCursor: string): string | null {
  const lower = textBeforeCursor.toLowerCase()
  const selectIdx = lower.lastIndexOf('select')
  if (selectIdx === -1) return null

  let tail = textBeforeCursor.slice(selectIdx)
  const fromIdx = tail.search(/\bfrom\b/i)
  if (fromIdx > 0) {
    tail = tail.slice(0, fromIdx)
  }

  const listPart = tail.replace(/^select\s+(?:distinct\s+)?/i, '').trim()
  if (listPart === '*') return null

  const afterComma = tail.match(/,\s*([\w]*)$/i)
  if (afterComma) return afterComma[1] ?? ''

  const firstColumn = tail.match(/\bselect\s+(?:distinct\s+)?([\w]*)$/i)
  if (firstColumn) return firstColumn[1] ?? ''

  return null
}

export function getClauseColumnContext(textBeforeCursor: string): ClauseColumnContext | null {
  const whereMatch =
    textBeforeCursor.match(/\bwhere\s+([\w]*)$/i) ??
    textBeforeCursor.match(/\band\s+([\w]*)$/i) ??
    textBeforeCursor.match(/(?<=\s)or\s+([\w]*)$/i)
  if (whereMatch) {
    return { clause: 'where', prefix: whereMatch[1] ?? '' }
  }

  const selectPrefix = getSelectListPrefix(textBeforeCursor)
  if (selectPrefix !== null) {
    return { clause: 'select', prefix: selectPrefix }
  }

  return null
}

export function buildMergedColumnSuggestions(
  columnsByTable: Array<{ table: TableRef; alias: string; columns: string[] }>,
  prefix: string
): ColumnCompletionItem[] {
  const normalizedPrefix = prefix.toLowerCase()
  const byName = new Map<string, ColumnCompletionItem>()

  for (const { table, alias, columns } of columnsByTable) {
    const tableKey = `${table.schema}.${table.table}`
    for (const column of columns) {
      if (normalizedPrefix && !column.toLowerCase().startsWith(normalizedPrefix)) continue

      const existing = byName.get(column.toLowerCase())
      const detail = `${alias} · ${tableKey}`
      if (!existing) {
        byName.set(column.toLowerCase(), {
          name: column,
          insertText: column,
          detail,
        })
        continue
      }

      if (existing.detail !== detail) {
        byName.set(column.toLowerCase(), {
          name: column,
          insertText: `${alias}.${column}`,
          detail,
        })
      }
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function aliasByTableKey(
  sql: string,
  schemaTables: SchemaTableRef[]
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [alias, ref] of Object.entries(buildAliasMap(sql, schemaTables))) {
    const key = `${ref.schema}.${ref.table}`
    if (!(key in result)) result[key] = alias
  }
  return result
}
