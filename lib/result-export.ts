export type ResultExportRow = Record<string, unknown>

export function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function rowsToCsv(
  fields: string[],
  rows: ResultExportRow[],
  formatCell: (value: unknown) => string
): string {
  const header = fields.map((field) => escapeCsvCell(field)).join(',')
  const body = rows.map((row) => fields.map((field) => escapeCsvCell(formatCell(row[field]))).join(','))
  return [header, ...body].join('\n')
}

/**
 * A UTF-8 byte-order mark for downloaded CSV files. Without it Excel reads the
 * file in the system's legacy code page, garbling CJK and other non-Latin text.
 * Clipboard copies (TSV) never carry it.
 */
export const CSV_BOM = '\uFEFF'

export function rowsToTsv(
  fields: string[],
  rows: ResultExportRow[],
  formatCell: (value: unknown) => string
): string {
  const header = fields.join('\t')
  const body = rows.map((row) => fields.map((field) => formatCell(row[field])).join('\t'))
  return [header, ...body].join('\n')
}

export function rowsToJson(fields: string[], rows: ResultExportRow[]): string {
  const payload = rows.map((row) => {
    const entry: Record<string, unknown> = {}
    for (const field of fields) {
      entry[field] = row[field]
    }
    return entry
  })
  return `${JSON.stringify(payload, null, 2)}\n`
}

export function downloadText(filename: string, content: string, mimeType: string) {
  downloadBlob(filename, new Blob([content], { type: mimeType }))
}

/**
 * Save a Blob through the browser's download flow. In the desktop app this is
 * Electron's default download handler, which shows a native save dialog.
 * The object URL is revoked after a delay rather than right after click():
 * the download reads it asynchronously, and large blobs may not be read yet.
 */
export function downloadBlob(filename: string, blob: Blob) {
  if (typeof document === 'undefined') return
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function buildResultExportFilename(prefix: string, extension: string, statementIndex: number) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${prefix}-statement-${statementIndex + 1}-${stamp}.${extension}`
}
