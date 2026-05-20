const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function looksLikeUuid(text: string) {
  return UUID_RE.test(text)
}

/** First segment before the hyphen (e.g. `550e8400` from a standard UUID). */
export function formatUuidDisplay(text: string) {
  const dash = text.indexOf('-')
  if (dash > 0) return text.slice(0, dash)
  return text
}

export function shouldShortenUuidDisplay(text: string, dataType?: string) {
  if (dataType?.toLowerCase() === 'uuid') return text.length > 0
  return looksLikeUuid(text)
}

export function copyableCellDisplayProps(
  value: unknown,
  options?: { dataType?: string }
): { text: string; displayText?: string } {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)

  if (!shouldShortenUuidDisplay(text, options?.dataType)) {
    return { text }
  }

  const displayText = formatUuidDisplay(text)
  if (displayText === text) return { text }
  return { text, displayText }
}
