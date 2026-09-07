const NOTEBOOK_PARAM_REGEX = /{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}/g

export function extractTemplateKeys(sql: string) {
  NOTEBOOK_PARAM_REGEX.lastIndex = 0
  const out: string[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = NOTEBOOK_PARAM_REGEX.exec(sql)) !== null) {
    const key = match[1]
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  NOTEBOOK_PARAM_REGEX.lastIndex = 0
  return out
}

export function compileSqlTemplate(sql: string, valuesByKey: Record<string, unknown>) {
  const keyIndex = new Map<string, number>()
  const values: unknown[] = []

  try {
    const text = sql.replace(NOTEBOOK_PARAM_REGEX, (_all, key: string) => {
      if (!(key in valuesByKey)) {
        throw new Error(`Missing input value for '{{${key}}}'`)
      }
      const existing = keyIndex.get(key)
      if (existing !== undefined) return `$${existing}`
      const index = values.length + 1
      keyIndex.set(key, index)
      values.push(valuesByKey[key])
      return `$${index}`
    })

    NOTEBOOK_PARAM_REGEX.lastIndex = 0
    return { text, values, keys: [...keyIndex.keys()] }
  } catch (error) {
    NOTEBOOK_PARAM_REGEX.lastIndex = 0
    throw error
  }
}

export type ExecutedQueryParam = {
  /** Template key as written in the cell, e.g. `param_2r98h1`. */
  key: string
  /** Positional placeholder the key was compiled to, e.g. `$1`. */
  placeholder: string
  /** The exact value bound to the placeholder. */
  value: unknown
  /** `typeof` style label for the value, with `null` / `array` distinguished. */
  valueType: string
  /** Where the value was resolved from. */
  source: 'request' | 'widget'
  /** Human hint for values that commonly lead to surprising results. */
  warning?: string
}

/**
 * What was actually sent to Postgres for a notebook SQL cell: the compiled
 * text with `$n` placeholders, the bound values, and a per-key breakdown.
 * Attached to run results so the UI can show a debug view.
 */
export type ExecutedQueryInfo = {
  text: string
  values: unknown[]
  params: ExecutedQueryParam[]
}

export function describeParamValueType(value: unknown) {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return `array(${value.length})`
  if (value instanceof Date) return 'date'
  return typeof value
}

function warningForParamValue(value: unknown): string | undefined {
  if (value === undefined) return 'Value is undefined; Postgres receives NULL.'
  if (value === null) return 'Value is NULL. `= NULL` never matches; use `IS NULL`.'
  if (value === '') return 'Value is an empty string.'
  if (Array.isArray(value)) {
    if (value.length === 0) return 'Value is an empty array.'
    return 'Value is an array. Compare with `= ANY({{key}})`, not `=`.'
  }
  if (typeof value === 'string' && value !== value.trim()) {
    return 'Value has leading or trailing whitespace.'
  }
  return undefined
}

/** Quotes a bound value as a SQL literal for display only. Never execute this. */
export function formatSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (value instanceof Date) return `'${value.toISOString()}'`
  if (Array.isArray(value)) return `ARRAY[${value.map(formatSqlLiteral).join(', ')}]`
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return `'${text.replace(/'/g, "''")}'`
}

/**
 * Renders the compiled SQL with the bound values inlined as literals, for
 * reading and copying into psql. Placeholders are matched as whole tokens so
 * `$1` never eats into `$10`.
 */
export function renderSqlWithInlineValues(text: string, values: unknown[]) {
  return text.replace(/\$(\d+)(?!\d)/g, (all, digits: string) => {
    const index = Number(digits) - 1
    if (index < 0 || index >= values.length) return all
    return formatSqlLiteral(values[index])
  })
}

export function buildExecutedQueryInfo(input: {
  text: string
  values: unknown[]
  keys: string[]
  sourceByKey: Record<string, 'request' | 'widget'>
}): ExecutedQueryInfo {
  return {
    text: input.text,
    values: input.values,
    params: input.keys.map((key, index) => {
      const value = input.values[index]
      const warning = warningForParamValue(value)
      return {
        key,
        placeholder: `$${index + 1}`,
        value,
        valueType: describeParamValueType(value),
        source: input.sourceByKey[key] ?? 'request',
        ...(warning ? { warning: warning.replace('{{key}}', `{{${key}}}`) } : {}),
      }
    }),
  }
}
