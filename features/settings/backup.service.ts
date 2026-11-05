import { HttpError } from '@/lib/http'
import { downloadBlob } from '@/lib/result-export'

const FALLBACK_FILENAME = 'meta-backup.sqlite'

/** Pull `filename="…"` out of a Content-Disposition header. */
export function filenameFromContentDisposition(header: string | null): string | null {
  const match = header?.match(/filename="([^"]+)"/i)
  return match ? match[1] : null
}

/**
 * Fetch a snapshot of the local app database and hand it to the browser's
 * download flow. Resolves with the suggested filename.
 */
export async function downloadMetaBackup(): Promise<string> {
  const response = await fetch('/api/meta-backup')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: unknown; code?: unknown }
    throw new HttpError(typeof body.error === 'string' ? body.error : `Backup failed: ${response.status}`, {
      status: response.status,
      code: typeof body.code === 'string' ? body.code : undefined,
    })
  }

  const blob = await response.blob()
  const filename =
    filenameFromContentDisposition(response.headers.get('Content-Disposition')) ?? FALLBACK_FILENAME
  downloadBlob(filename, blob)
  return filename
}
