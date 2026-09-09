import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import BetterSqlite3 from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../drizzle/schema'
import { getMetaDbDir, getMetaDbPath } from './meta-db-path'
import { getMigrationsDir, getSqliteNativeBinding } from './runtime-paths'

/**
 * The metadata DB is opened lazily on first access, never at import time.
 *
 * `better-sqlite3` is a native addon: constructing a Database loads a compiled
 * binary and touches the filesystem. Doing that at module load meant importing
 * anything from `lib/db` — including pure helpers like `splitStatements` — paid
 * for a SQLite handle, and a Node ABI mismatch failed test files that never
 * touch the database. Use `getMetaDb()` / `getSqlite()` instead of module-level
 * bindings so the cost lands only on code that actually queries.
 */
type MetaDbHandles = {
  sqlite: BetterSqlite3.Database
  metaDb: BetterSQLite3Database<typeof schema>
}

let handles: MetaDbHandles | null = null

function openMetaDb(): MetaDbHandles {
  const dataDir = getMetaDbDir()
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })

  // A packaged desktop app loads an Electron-ABI addon from resourcesPath;
  // everywhere else this is undefined and better-sqlite3 resolves its own
  // Node-ABI build through `bindings`, exactly as before.
  const nativeBinding = getSqliteNativeBinding()
  const sqlite = new BetterSqlite3(getMetaDbPath(), nativeBinding ? { nativeBinding } : {})
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  return { sqlite, metaDb: drizzle(sqlite, { schema }) }
}

function getHandles(): MetaDbHandles {
  if (handles) return handles
  handles = openMetaDb()
  reconcileSchema(handles)
  return handles
}

export function getSqlite() {
  return getHandles().sqlite
}

export function getMetaDb() {
  return getHandles().metaDb
}

/**
 * Close the metadata DB, checkpointing the WAL first so no `-wal`/`-shm`
 * siblings are left next to `history.db`. Safe to call when never opened.
 *
 * Synchronous by design: it runs from Electron's `before-quit` and from a
 * `process.on('exit')` fallback, neither of which can await.
 */
export function closeMetaDb() {
  const current = handles
  if (!current) return
  handles = null
  try {
    current.sqlite.pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    // A checkpoint failure must not block shutdown; close still releases the file.
  }
  try {
    current.sqlite.close()
  } catch {
    // Already closed, or closing during an abnormal exit.
  }
}

export function ensureMetaDbReady() {
  const alreadyOpen = handles !== null
  const current = getHandles()
  // getHandles() reconciles on open; only re-run for explicit later calls.
  if (alreadyOpen) reconcileSchema(current)
}

/**
 * Bring the metadata DB to the current schema.
 *
 * The Drizzle migration journal is the single source of truth: every table and
 * column is defined by a file under drizzle/migrations, and `migrate()` always
 * runs. Nothing here mirrors a migration. The two repairs below exist only to
 * let the migrator succeed on databases that predate that rule, where a column
 * was added by application code without a journal entry.
 */
function reconcileSchema({ sqlite, metaDb }: MetaDbHandles) {
  const hasTable = (name: string) =>
    Boolean(sqlite.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`).get(name))

  const hasColumn = (table: string, column: string) =>
    Boolean(sqlite.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ? LIMIT 1`).get(table, column))

  const migrationHash = (file: string) =>
    createHash('sha256')
      .update(readFileSync(join(getMigrationsDir(), file), 'utf8'))
      .digest('hex')

  const isMigrationRecorded = (hash: string) =>
    hasTable('__drizzle_migrations') &&
    Boolean(sqlite.prepare(`SELECT 1 FROM __drizzle_migrations WHERE hash = ? LIMIT 1`).get(hash))

  // Repair 1 (legacy dev drift): notebook_cells.metadata_json was added by hand
  // before 0006 existed. Record 0006 as applied so the ALTER is not re-run.
  if (hasTable('notebook_cells') && hasColumn('notebook_cells', 'metadata_json')) {
    const file = '0006_input_cell_metadata.sql'
    if (existsSync(join(getMigrationsDir(), file))) {
      const hash = migrationHash(file)
      if (hasTable('__drizzle_migrations') && !isMigrationRecorded(hash)) {
        sqlite
          .prepare(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`)
          .run(hash, 1772300000000)
      }
    }
  }

  // Repair 2: notebook_cells.last_result_json was created by this file, never by
  // a migration, until 0012. A database that already has the column would make
  // 0012's ALTER fail, and recording 0012 early would skip every migration
  // between the DB's last one and 0012 (Drizzle applies by timestamp). So stage
  // the drifted values in a side table, drop the drifted column, let 0012 create
  // the real one, and copy the values back once every pending migration has run.
  // A side table (rather than a renamed column) survives later rebuilds of
  // notebook_cells such as 0013, and a crash between the two steps is harmless:
  // the next open finds the side table and finishes the copy.
  const LEGACY_RESULT_TABLE = '__legacy_notebook_cell_results'
  if (
    hasTable('notebook_cells') &&
    hasColumn('notebook_cells', 'last_result_json') &&
    !isMigrationRecorded(migrationHash('0012_notebook_cells_last_result_json.sql'))
  ) {
    sqlite.exec(`
      BEGIN;
      CREATE TABLE IF NOT EXISTS ${LEGACY_RESULT_TABLE} (cell_id text PRIMARY KEY, last_result_json text);
      INSERT OR REPLACE INTO ${LEGACY_RESULT_TABLE} (cell_id, last_result_json)
        SELECT id, last_result_json FROM notebook_cells WHERE last_result_json IS NOT NULL;
      ALTER TABLE notebook_cells DROP COLUMN last_result_json;
      COMMIT;
    `)
  }

  migrate(metaDb, { migrationsFolder: getMigrationsDir() })

  if (hasTable(LEGACY_RESULT_TABLE)) {
    sqlite.exec(`
      BEGIN;
      UPDATE notebook_cells
        SET last_result_json = (
          SELECT staged.last_result_json FROM ${LEGACY_RESULT_TABLE} staged WHERE staged.cell_id = notebook_cells.id
        )
        WHERE id IN (SELECT cell_id FROM ${LEGACY_RESULT_TABLE});
      DROP TABLE ${LEGACY_RESULT_TABLE};
      COMMIT;
    `)
  }
}
