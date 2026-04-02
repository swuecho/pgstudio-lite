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
