import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle', 'migrations')
const LAST_RESULT_MIGRATION = '0012_notebook_cells_last_result_json.sql'

type Journal = { entries: Array<{ tag: string; when: number }> }

function journal(): Journal {
  return JSON.parse(readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8')) as Journal
}

function migrationHash(file: string) {
  return createHash('sha256')
    .update(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
    .digest('hex')
}

/**
 * Build a database the way a pre-0012 app version left it: every migration up
 * to (not including) 0012 recorded by Drizzle, plus the `last_result_json`
 * column that lib/meta-db.ts used to add by hand, holding real data.
 */
function buildLegacyDatabase(path: string) {
  const db = new BetterSqlite3(path)
  db.pragma('journal_mode = WAL')
  db.exec(`CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`)
  const insert = db.prepare(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`)
  for (const entry of journal().entries) {
    if (entry.tag.startsWith('0012')) break
    const file = `${entry.tag}.sql`
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) db.exec(statement)
    }
    insert.run(migrationHash(file), entry.when)
  }
  // What reconcileSchema used to do outside the journal.
  db.exec(`ALTER TABLE notebook_cells ADD COLUMN last_result_json text;`)
  db.exec(`
    INSERT INTO notebooks (id, title, description, metadata_json, connection_name, created_at, updated_at)
    VALUES ('nb', 'Legacy', '', '{}', 'default', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    INSERT INTO notebook_cells (id, notebook_id, position, type, content, collapsed, last_result_json, updated_at)
    VALUES ('c1', 'nb', 0, 'sql', 'select 1', 0, '{"totalRows":1}', '2026-01-01T00:00:00.000Z');
    INSERT INTO notebook_cells (id, notebook_id, position, type, content, collapsed, last_result_json, updated_at)
    VALUES ('c2', 'nb', 1, 'sql', 'select 2', 0, NULL, '2026-01-01T00:00:00.000Z');
  `)
  db.close()
}

function columns(db: BetterSqlite3.Database, table: string) {
  return (db.prepare(`SELECT name FROM pragma_table_info(?)`).all(table) as Array<{ name: string }>).map(
    (r) => r.name
  )
}

describe('metadata DB migrations', () => {
  let dir: string
  let previousPath: string | undefined

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pgstudio-migrate-'))
    previousPath = process.env.PGSTUDIO_META_DB_PATH
    vi.resetModules()
  })

  afterEach(async () => {
    const metaDb = await import('../lib/meta-db')
    metaDb.closeMetaDb()
    if (previousPath === undefined) delete process.env.PGSTUDIO_META_DB_PATH
    else process.env.PGSTUDIO_META_DB_PATH = previousPath
    rmSync(dir, { recursive: true, force: true })
    vi.resetModules()
  })

  it('the journal alone produces the full schema on a fresh database', async () => {
    const path = join(dir, 'fresh.db')
    process.env.PGSTUDIO_META_DB_PATH = path
    const metaDb = await import('../lib/meta-db')
    metaDb.ensureMetaDbReady()

    const sqlite = metaDb.getSqlite()
    const tables = (
      sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>
    )
      .map((r) => r.name)
      .sort()
    for (const expected of [
      'db_connections',
      'query_history',
      'query_snippets',
      'notebooks',
      'notebook_cells',
      'notebook_runs',
      'notebook_schedules',
      'table_editor_bookmarks',
      'table_editor_recent_views',
      'table_foreign_key_display',
    ]) {
      expect(tables).toContain(expected)
    }
    expect(columns(sqlite, 'notebook_cells')).toContain('last_result_json')
    expect(columns(sqlite, 'notebook_cells')).not.toContain('__legacy_last_result_json')
    expect(columns(sqlite, 'notebooks')).toEqual(
      expect.arrayContaining(['description', 'metadata_json', 'connection_name'])
    )
    const indexes = (
      sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`).all() as Array<{ name: string }>
    ).map((r) => r.name)
    expect(indexes).toContain('idx_notebooks_connection_name')

    const recorded = sqlite.prepare(`SELECT count(*) as n FROM __drizzle_migrations`).get() as { n: number }
    expect(recorded.n).toBe(readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).length)
  })

  it('migrates a database whose last_result_json predates 0012 without losing data', async () => {
    const path = join(dir, 'legacy.db')
    buildLegacyDatabase(path)
    process.env.PGSTUDIO_META_DB_PATH = path

    const metaDb = await import('../lib/meta-db')
    metaDb.ensureMetaDbReady()

    const sqlite = metaDb.getSqlite()
    const cellColumns = columns(sqlite, 'notebook_cells')
    expect(cellColumns.filter((name) => name === 'last_result_json')).toHaveLength(1)
    expect(cellColumns).not.toContain('__legacy_last_result_json')

    const rows = sqlite.prepare(`SELECT id, last_result_json FROM notebook_cells ORDER BY position`).all()
    expect(rows).toEqual([
      { id: 'c1', last_result_json: '{"totalRows":1}' },
      { id: 'c2', last_result_json: null },
    ])

    const recorded = sqlite
      .prepare(`SELECT 1 FROM __drizzle_migrations WHERE hash = ?`)
      .get(migrationHash(LAST_RESULT_MIGRATION))
    expect(recorded).toBeTruthy()

    // Re-opening is a no-op: nothing left to repair, nothing to migrate.
    metaDb.ensureMetaDbReady()
    expect(columns(sqlite, 'notebook_cells').filter((name) => name === 'last_result_json')).toHaveLength(1)
  })
})
