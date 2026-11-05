import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { getSqlite } from './meta-db'
import { getSqliteNativeBinding } from './runtime-paths'

export const META_BACKUP_CONTENT_TYPE = 'application/vnd.sqlite3'

export type MetaBackup = {
  filename: string
  bytes: Buffer
}

const pad = (value: number) => String(value).padStart(2, '0')

/** `meta-backup-YYYYMMDD-HHMMSS.sqlite`, in local time so it matches the user's clock. */
export function buildMetaBackupFilename(date: Date = new Date()) {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `meta-backup-${day}-${time}.sqlite`
}

/**
 * Snapshot the metadata DB (history, snippets, notebooks, connections,
 * table-editor views) into a standalone SQLite file and return its bytes.
 *
 * Uses SQLite's online backup API, so the copy is consistent while the app
 * keeps writing and includes pages still sitting in the WAL; a plain file copy
 * of `history.db` would miss those. The live DB runs in WAL mode and the
 * backup copies that header flag, so the copy is switched back to a rollback
 * journal before it is read: the result is one self-contained file with no
 * `-wal`/`-shm` siblings that any SQLite tool can open.
 */
export async function createMetaBackup(now: Date = new Date()): Promise<MetaBackup> {
  const workDir = mkdtempSync(join(tmpdir(), 'pgstudio-meta-backup-'))
  const target = join(workDir, 'backup.sqlite')
  try {
    await getSqlite().backup(target)

    const nativeBinding = getSqliteNativeBinding()
    const copy = new BetterSqlite3(target, nativeBinding ? { nativeBinding } : {})
    try {
      copy.pragma('journal_mode = DELETE')
    } finally {
      copy.close()
    }

    return { filename: buildMetaBackupFilename(now), bytes: readFileSync(target) }
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}
