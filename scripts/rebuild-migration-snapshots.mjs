/**
 * Rebuilds drizzle/migrations/meta/NNNN_snapshot.json, one per journal entry.
 *
 * Why: migrations in this repo are hand-written SQL (docs/migrations/README.md),
 * and a hand-written migration produces no snapshot. `drizzle-kit generate`
 * diffs drizzle/schema.ts against the newest snapshot it can find, so a gap in
 * the chain makes the next generated migration re-emit DDL that older
 * migrations already applied.
 *
 * How: for each journal entry, apply migrations 0..N to a scratch SQLite file,
 * `drizzle-kit pull` it, and store the pulled snapshot under the entry's index.
 * The snapshots therefore describe what the SQL really produces, not what
 * schema.ts claims. Snapshot ids derive from the migration tag, so reruns are
 * byte-identical.
 *
 *   npm run db:snapshots
 *
 * tests/migration-snapshots.test.ts checks the committed snapshots against the
 * migrations and fails when a new migration lands without rerunning this.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import BetterSqlite3 from 'better-sqlite3'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(root, 'drizzle', 'migrations')
const metaDir = join(migrationsDir, 'meta')
const drizzleKit = join(root, 'node_modules', '.bin', 'drizzle-kit')
const ZERO_ID = '00000000-0000-0000-0000-000000000000'

const snapshotFile = (idx) => `${String(idx).padStart(4, '0')}_snapshot.json`

/** Deterministic, UUID-shaped id so reruns do not churn the files. */
function snapshotId(tag) {
  const hex = createHash('sha1').update(`pgstudio-lite snapshot ${tag}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function applyMigrations(dbPath, entries) {
  const db = new BetterSqlite3(dbPath)
  try {
    for (const entry of entries) {
      const sql = readFileSync(join(migrationsDir, `${entry.tag}.sql`), 'utf8')
      for (const statement of sql.split('--> statement-breakpoint')) {
        if (statement.trim()) db.exec(statement)
      }
    }
  } finally {
    db.close()
  }
}

function pullSnapshot(dbPath, outDir) {
  execFileSync(drizzleKit, ['pull', '--dialect', 'sqlite', '--url', dbPath, '--out', outDir], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  return JSON.parse(readFileSync(join(outDir, 'meta', '0000_snapshot.json'), 'utf8'))
}

const journal = JSON.parse(readFileSync(join(metaDir, '_journal.json'), 'utf8'))
const entries = [...journal.entries].sort((a, b) => a.idx - b.idx)
const work = mkdtempSync(join(tmpdir(), 'pgstudio-snapshots-'))

try {
  let prevId = ZERO_ID
  for (const entry of entries) {
    const stepDir = join(work, String(entry.idx))
    mkdirSync(stepDir, { recursive: true })
    const dbPath = join(stepDir, 'meta.db')
    applyMigrations(
      dbPath,
      entries.filter((candidate) => candidate.idx <= entry.idx)
    )
    const pulled = pullSnapshot(dbPath, join(stepDir, 'pulled'))
    const id = snapshotId(entry.tag)
    // `internal` is what `drizzle-kit generate` adds and `pull` omits; keep the
    // files in the shape generate expects.
    const snapshot = { ...pulled, id, prevId, internal: pulled.internal ?? { indexes: {} } }
    writeFileSync(join(metaDir, snapshotFile(entry.idx)), JSON.stringify(snapshot, null, 2))
    console.log(`${snapshotFile(entry.idx)}  <-  ${entry.tag}`)
    prevId = id
  }

  const expected = new Set(entries.map((entry) => snapshotFile(entry.idx)))
  for (const file of readdirSync(metaDir)) {
    if (/^\d{4}_snapshot\.json$/.test(file) && !expected.has(file)) {
      rmSync(join(metaDir, file))
      console.log(`removed stale ${file}`)
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
