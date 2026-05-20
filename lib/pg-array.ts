export function parsePgStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value !== 'string') return []
  const trimmed = value.trim()
  if (!trimmed || trimmed === '{}') return []
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      // Fall through to PostgreSQL array literal parsing.
    }
  }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim()
    if (!inner) return []
    return inner.split(',').map((part) => part.trim().replace(/^"(.*)"$/, '$1'))
  }
  return [trimmed]
}
