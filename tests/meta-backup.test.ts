import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from '@/pages/api/meta-backup'
import { querySnippets } from '@/drizzle/schema'
import { buildMetaBackupFilename, createMetaBackup } from '@/lib/meta-backup'
import { getMetaDb } from '@/lib/meta-db'
import { invokeApi } from './helpers/invoke-api'

// Pass-through mock so one test can make the backup fail; the rest use the real function.
vi.mock('@/lib/meta-backup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/meta-backup')>()
  return { ...actual, createMetaBackup: vi.fn(actual.createMetaBackup) }
})

const EXPECTED_TABLES = [
  'db_connections',
  'query_history',
  'query_snippets',
  'notebooks',
  'notebook_cells',
  'table_editor_bookmarks',
  'table_editor_recent_views',
  '__drizzle_migrations',
]

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

/** Write backup bytes to disk and open them read-only, as a user's SQLite tool would. */
function openBackup(bytes: Buffer) {
  const dir = mkdtempSync(join(tmpdir(), 'pgstudio-backup-test-'))
  tempDirs.push(dir)
  const path = join(dir, 'backup.sqlite')
  writeFileSync(path, bytes)
  return new BetterSqlite3(path, { readonly: true, fileMustExist: true })
}

function insertSnippet(title: string) {
  const now = new Date().toISOString()
  getMetaDb()
    .insert(querySnippets)
    .values({
      id: randomUUID(),
      title,
      queryText: 'select 1',
      connectionName: 'default',
      createdAt: now,
      updatedAt: now,
    })
    .run()
}

describe('buildMetaBackupFilename', () => {
  it('formats a local timestamp as YYYYMMDD-HHMMSS', () => {
    expect(buildMetaBackupFilename(new Date(2026, 0, 2, 3, 4, 5))).toBe('meta-backup-20260102-030405.sqlite')
    expect(buildMetaBackupFilename(new Date(2026, 10, 25, 23, 59, 9))).toBe(
      'meta-backup-20261125-235909.sqlite'
    )
  })
})

describe('createMetaBackup', () => {
  it('produces a standalone SQLite file with the app tables and current rows', async () => {
    const title = `backup-${randomUUID()}`
    insertSnippet(title)

    const { filename, bytes } = await createMetaBackup(new Date(2026, 4, 6, 7, 8, 9))
    expect(filename).toBe('meta-backup-20260506-070809.sqlite')
    expect(bytes.subarray(0, 16).toString('latin1')).toBe('SQLite format 3\u0000')

    const db = openBackup(bytes)
    try {
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
      // Rollback journal, not WAL: the file needs no -wal/-shm siblings.
      expect(db.pragma('journal_mode', { simple: true })).toBe('delete')

      const tables = (
        db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>
      ).map((row) => row.name)
      expect(tables).toEqual(expect.arrayContaining(EXPECTED_TABLES))

      const row = db.prepare(`SELECT title FROM query_snippets WHERE title = ?`).get(title)
      expect(row).toEqual({ title })
    } finally {
      db.close()
    }
  })

  it('includes writes that are still only in the WAL', async () => {
    // The live DB is in WAL mode and is never checkpointed here, so a raw
    // copy of the main file would miss this row.
    const title = `wal-${randomUUID()}`
    insertSnippet(title)

    const db = openBackup((await createMetaBackup()).bytes)
    try {
      expect(db.prepare(`SELECT count(*) AS n FROM query_snippets WHERE title = ?`).get(title)).toEqual({
        n: 1,
      })
    } finally {
      db.close()
    }
  })
})

describe('/api/meta-backup', () => {
  it('returns the backup as an attachment', async () => {
    const res = await invokeApi<Buffer>(handler, { method: 'GET' })

    expect(res.statusCode).toBe(200)
    expect(res.getHeader('Content-Type')).toBe('application/vnd.sqlite3')
    expect(res.getHeader('Cache-Control')).toBe('no-store')
    expect(res.getHeader('Content-Disposition')).toMatch(
      /^attachment; filename="meta-backup-\d{8}-\d{6}\.sqlite"$/
    )
    expect(Buffer.isBuffer(res.payload)).toBe(true)

    const db = openBackup(res.payload)
    try {
      const tables = (
        db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>
      ).map((row) => row.name)
      expect(tables).toEqual(expect.arrayContaining(EXPECTED_TABLES))
    } finally {
      db.close()
    }
  })

  it('rejects other methods with 405', async () => {
    const res = await invokeApi(handler, { method: 'POST' })
    expect(res.statusCode).toBe(405)
    expect(res.getHeader('Allow')).toBe('GET')
  })

  it('reports backup failures through the API error shape', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(createMetaBackup).mockRejectedValueOnce(new Error('disk full'))

    const res = await invokeApi<{ error: string; code: string }>(handler, { method: 'GET' })
    expect(res.statusCode).toBe(500)
    expect(res.payload).toMatchObject({ code: 'INTERNAL_ERROR' })
  })
})
