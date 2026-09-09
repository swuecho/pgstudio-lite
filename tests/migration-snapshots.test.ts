import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

/**
 * `drizzle-kit generate` diffs drizzle/schema.ts against the newest snapshot in
 * drizzle/migrations/meta. Migrations here are hand-written, so snapshots are
 * rebuilt from the SQL by scripts/rebuild-migration-snapshots.mjs
 * (`npm run db:snapshots`). These tests fail when that step was skipped.
 */
const MIGRATIONS_DIR = join(process.cwd(), 'drizzle', 'migrations')
const META_DIR = join(MIGRATIONS_DIR, 'meta')
const ZERO_ID = '00000000-0000-0000-0000-000000000000'

type Journal = { entries: Array<{ idx: number; tag: string }> }
type SnapshotColumn = { name: string; notNull: boolean }
type SnapshotTable = {
  name: string
  columns: Record<string, SnapshotColumn>
  indexes: Record<string, { name: string; columns: string[]; isUnique: boolean }>
}
type Snapshot = { id: string; prevId: string; tables: Record<string, SnapshotTable> }

const journal = JSON.parse(readFileSync(join(META_DIR, '_journal.json'), 'utf8')) as Journal
const entries = [...journal.entries].sort((a, b) => a.idx - b.idx)

const snapshotFile = (idx: number) => `${String(idx).padStart(4, '0')}_snapshot.json`
const readSnapshot = (idx: number) =>
  JSON.parse(readFileSync(join(META_DIR, snapshotFile(idx)), 'utf8')) as Snapshot

function buildDatabase(upToIdx: number) {
  const db = new BetterSqlite3(':memory:')
  for (const entry of entries) {
    if (entry.idx > upToIdx) break
    const sql = readFileSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) db.exec(statement)
    }
  }
  return db
}

function describeDatabase(db: BetterSqlite3.Database) {
  const tables = (
    db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      )
      .all() as Array<{ name: string }>
  ).map((row) => row.name)

  return Object.fromEntries(
    tables.map((table) => {
      const columns = (
        db
          .prepare(`SELECT name, "notnull" AS "nn" FROM pragma_table_info(?) ORDER BY name`)
          .all(table) as Array<{
          name: string
          nn: number
        }>
      ).map((column) => ({ name: column.name, notNull: column.nn === 1 }))
      const indexes = (
        db
          .prepare(
            `SELECT name, "unique" AS isUnique FROM pragma_index_list(?) WHERE origin = 'c' ORDER BY name`
          )
          .all(table) as Array<{ name: string; isUnique: number }>
      ).map((index) => ({
        name: index.name,
        isUnique: index.isUnique === 1,
        columns: (
          db.prepare(`SELECT name FROM pragma_index_info(?)`).all(index.name) as Array<{ name: string }>
        ).map((column) => column.name),
      }))
      return [table, { columns, indexes }]
    })
  )
}

function describeSnapshot(snapshot: Snapshot) {
  return Object.fromEntries(
    Object.entries(snapshot.tables)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([table, definition]) => [
        table,
        {
          columns: Object.values(definition.columns)
            .map((column) => ({ name: column.name, notNull: column.notNull }))
            .sort((a, b) => a.name.localeCompare(b.name)),
          indexes: Object.values(definition.indexes)
            .map((index) => ({ name: index.name, isUnique: index.isUnique, columns: index.columns }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        },
      ])
  )
}

describe('migration snapshots', () => {
  it('has exactly one snapshot per journal entry', () => {
    const files = readdirSync(META_DIR)
      .filter((file) => /^\d{4}_snapshot\.json$/.test(file))
      .sort()
    expect(files).toEqual(entries.map((entry) => snapshotFile(entry.idx)))
  })

  it('chains prevId to the previous snapshot id in journal order', () => {
    let prevId = ZERO_ID
    const ids = new Set<string>()
    for (const entry of entries) {
      const snapshot = readSnapshot(entry.idx)
      expect(snapshot.prevId, `${entry.tag} prevId`).toBe(prevId)
      ids.add(snapshot.id)
      prevId = snapshot.id
    }
    expect(ids.size).toBe(entries.length)
  })

  it.each(entries.map((entry) => [entry.tag, entry.idx] as const))(
    'snapshot for %s describes the schema its migrations produce',
    (_tag, idx) => {
      const db = buildDatabase(idx)
      try {
        expect(describeSnapshot(readSnapshot(idx))).toEqual(describeDatabase(db))
      } finally {
        db.close()
      }
    }
  )
})
