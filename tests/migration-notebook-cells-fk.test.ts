import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

/**
 * 0013 rebuilds notebook_cells to add the foreign key to notebooks that
 * drizzle/schema.ts declared but no migration created. Drizzle applies
 * migrations inside one transaction with `PRAGMA foreign_keys = ON` already set
 * by lib/meta-db.ts, so that is how the migration is exercised here.
 */
const MIGRATIONS_DIR = join(process.cwd(), 'drizzle', 'migrations')
const FK_MIGRATION = '0013_notebook_cells_notebook_fk'

type Journal = { entries: Array<{ idx: number; tag: string }> }
const entries = (
  JSON.parse(readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8')) as Journal
).entries
  .slice()
  .sort((a, b) => a.idx - b.idx)

function applyMigration(db: BetterSqlite3.Database, tag: string) {
  const sql = readFileSync(join(MIGRATIONS_DIR, `${tag}.sql`), 'utf8')
  db.transaction(() => {
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) db.exec(statement)
    }
  })()
}

function databaseBefore0013() {
  const db = new BetterSqlite3(':memory:')
  db.pragma('foreign_keys = ON')
  for (const entry of entries) {
    if (entry.tag === FK_MIGRATION) break
    applyMigration(db, entry.tag)
  }
  db.exec(`
    INSERT INTO notebooks (id, title, description, metadata_json, connection_name, created_at, updated_at)
    VALUES ('nb', 'Kept', '', '{}', 'default', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    INSERT INTO notebook_cells (id, notebook_id, position, type, content, collapsed, last_result_json, metadata_json, updated_at)
    VALUES ('c1', 'nb', 0, 'sql', 'select 1', 0, '{"totalRows":1}', '{"widgetType":"text"}', '2026-01-01T00:00:00.000Z');
    INSERT INTO notebook_cells (id, notebook_id, position, type, content, collapsed, updated_at)
    VALUES ('orphan', 'deleted-notebook', 0, 'sql', 'select 2', 0, '2026-01-01T00:00:00.000Z');
  `)
  return db
}

describe(FK_MIGRATION, () => {
  it('is the last journal entry', () => {
    expect(entries.at(-1)?.tag).toBe(FK_MIGRATION)
  })

  it('keeps cell data, drops orphans, and installs the cascading foreign key', () => {
    const db = databaseBefore0013()
    try {
      applyMigration(db, FK_MIGRATION)

      const cells = db
        .prepare(`SELECT id, notebook_id, content, last_result_json, metadata_json FROM notebook_cells`)
        .all()
      expect(cells).toEqual([
        {
          id: 'c1',
          notebook_id: 'nb',
          content: 'select 1',
          last_result_json: '{"totalRows":1}',
          metadata_json: '{"widgetType":"text"}',
        },
      ])

      const foreignKeys = db
        .prepare(`SELECT "table", "from", "to", on_delete FROM pragma_foreign_key_list('notebook_cells')`)
        .all()
      expect(foreignKeys).toEqual([
        { table: 'notebooks', from: 'notebook_id', to: 'id', on_delete: 'CASCADE' },
      ])

      const indexes = (
        db
          .prepare(
            `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'notebook_cells' AND sql IS NOT NULL`
          )
          .all() as Array<{
          name: string
        }>
      )
        .map((row) => row.name)
        .sort()
      expect(indexes).toEqual(['idx_notebook_cells_notebook_position', 'idx_notebook_cells_updated_at'])
      expect(
        db.prepare(`SELECT name FROM sqlite_master WHERE name = '__new_notebook_cells'`).get()
      ).toBeUndefined()
    } finally {
      db.close()
    }
  })

  it('enforces the constraint afterwards', () => {
    const db = databaseBefore0013()
    try {
      applyMigration(db, FK_MIGRATION)

      expect(() =>
        db.exec(`
          INSERT INTO notebook_cells (id, notebook_id, position, type, content, collapsed, updated_at)
          VALUES ('c2', 'missing', 0, 'sql', '', 0, '2026-01-01T00:00:00.000Z')
        `)
      ).toThrow(/FOREIGN KEY constraint failed/)

      db.exec(`DELETE FROM notebooks WHERE id = 'nb'`)
      expect(db.prepare(`SELECT count(*) AS n FROM notebook_cells`).get()).toEqual({ n: 0 })
    } finally {
      db.close()
    }
  })
})
