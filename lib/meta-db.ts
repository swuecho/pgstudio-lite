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

function reconcileSchema({ sqlite, metaDb }: MetaDbHandles) {
  const hasTable = (name: string) =>
    Boolean(sqlite.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`).get(name))

  const hasColumn = (table: string, column: string) =>
    Boolean(sqlite.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ? LIMIT 1`).get(table, column))

  const isTestRuntime = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test')
  // Handle dev drift where metadata_json exists already but 0006 is not yet registered.
  const hasNotebookMetadataJsonColumn =
    hasTable('notebook_cells') && hasColumn('notebook_cells', 'metadata_json')
  if (hasNotebookMetadataJsonColumn) {
    const hasMigrationsTable = hasTable('__drizzle_migrations')
    if (hasMigrationsTable) {
      const migrationPath = join(getMigrationsDir(), '0006_input_cell_metadata.sql')
      if (existsSync(migrationPath)) {
        const migrationHash = createHash('sha256').update(readFileSync(migrationPath, 'utf8')).digest('hex')
        const alreadyApplied = sqlite
          .prepare(`SELECT 1 FROM __drizzle_migrations WHERE hash = ? LIMIT 1`)
          .get(migrationHash)
        if (!alreadyApplied) {
          sqlite
            .prepare(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`)
            .run(migrationHash, 1772300000000)
        }
      }
    }
  }

  const shouldRunMigrations = isTestRuntime || process.env.SKIP_RUNTIME_MIGRATE !== '1'
  if (shouldRunMigrations) {
    migrate(metaDb, { migrationsFolder: getMigrationsDir() })
  }

  if (isTestRuntime) {
    ensureBaseTables(sqlite)
  }

  if (hasTable('notebook_cells') && !hasColumn('notebook_cells', 'last_result_json')) {
    sqlite.exec(`ALTER TABLE notebook_cells ADD COLUMN last_result_json text;`)
  }

  if (hasTable('notebooks')) {
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_notebooks_connection_name ON notebooks (connection_name);`)
  }

  if (hasTable('notebooks') && !hasColumn('notebooks', 'metadata_json')) {
    sqlite.exec(`ALTER TABLE notebooks ADD COLUMN metadata_json text NOT NULL DEFAULT '{}';`)
    sqlite.exec(
      `UPDATE notebooks SET metadata_json = '{}' WHERE metadata_json IS NULL OR trim(metadata_json) = '';`
    )
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS table_foreign_key_display (
      id text PRIMARY KEY NOT NULL,
      connection_name text NOT NULL,
      schema_name text NOT NULL,
      table_name text NOT NULL,
      display_columns_json text NOT NULL,
      display_template text,
      created_at text NOT NULL,
      updated_at text NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_table_foreign_key_display_target
      ON table_foreign_key_display (connection_name, schema_name, table_name);
  `)

  if (hasTable('query_snippets')) {
    if (!hasColumn('query_snippets', 'connection_name')) {
      sqlite.exec(`ALTER TABLE query_snippets ADD COLUMN connection_name text;`)
    }

    if (hasTable('db_connections')) {
      sqlite.exec(`
        UPDATE query_snippets
        SET connection_name = COALESCE(
          NULLIF((SELECT name FROM db_connections WHERE is_default = 1 LIMIT 1), ''),
          NULLIF((SELECT name FROM db_connections ORDER BY name LIMIT 1), ''),
          'default'
        )
        WHERE connection_name IS NULL OR trim(connection_name) = '';
      `)
    }
  }
}

function ensureBaseTables(sqlite: BetterSqlite3.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS db_connections (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      connection_string text NOT NULL,
      is_default integer DEFAULT false NOT NULL,
      read_only integer DEFAULT false NOT NULL,
      created_at text NOT NULL,
      updated_at text NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_db_connections_name ON db_connections (name);
    CREATE INDEX IF NOT EXISTS idx_db_connections_default ON db_connections (is_default);

    CREATE TABLE IF NOT EXISTS query_history (
      id text PRIMARY KEY NOT NULL,
      connection_name text NOT NULL,
      query_text text NOT NULL,
      status text NOT NULL,
      duration_ms integer NOT NULL,
      row_count integer,
      error_text text,
      executed_at text NOT NULL,
      started_at text NOT NULL,
      metadata_json text
    );
    CREATE INDEX IF NOT EXISTS idx_query_history_executed_at ON query_history (executed_at);

    CREATE TABLE IF NOT EXISTS query_snippets (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      query_text text NOT NULL,
      connection_name text NOT NULL DEFAULT 'default',
      created_at text NOT NULL,
      updated_at text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_query_snippets_connection_updated_at ON query_snippets (connection_name, updated_at);
    CREATE INDEX IF NOT EXISTS idx_query_snippets_updated_at ON query_snippets (updated_at);

    CREATE TABLE IF NOT EXISTS notebooks (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      description text NOT NULL DEFAULT '',
      metadata_json text NOT NULL DEFAULT '{}',
      connection_name text NOT NULL,
      created_at text NOT NULL,
      updated_at text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notebooks_updated_at ON notebooks (updated_at);
    CREATE INDEX IF NOT EXISTS idx_notebooks_connection_name ON notebooks (connection_name);

    CREATE TABLE IF NOT EXISTS notebook_cells (
      id text PRIMARY KEY NOT NULL,
      notebook_id text NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      position integer NOT NULL,
      type text NOT NULL,
      content text NOT NULL,
      collapsed integer DEFAULT false NOT NULL,
      last_run_status text,
      last_run_at text,
      last_duration_ms integer,
      last_row_count integer,
      last_result_json text,
      last_error text,
      metadata_json text,
      updated_at text NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notebook_cells_notebook_position ON notebook_cells (notebook_id, position);
    CREATE INDEX IF NOT EXISTS idx_notebook_cells_updated_at ON notebook_cells (updated_at);

    CREATE TABLE IF NOT EXISTS table_editor_bookmarks (
      id text PRIMARY KEY NOT NULL,
      connection_name text NOT NULL,
      title text NOT NULL,
      pinned integer DEFAULT false NOT NULL,
      active_table text NOT NULL,
      filter_column text,
      filter_mode text,
      filter_value text,
      filter_value_end text,
      view_key text NOT NULL,
      created_at text NOT NULL,
      updated_at text NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_table_editor_bookmarks_connection_view_key ON table_editor_bookmarks (connection_name, view_key);
    CREATE INDEX IF NOT EXISTS idx_table_editor_bookmarks_connection_updated ON table_editor_bookmarks (connection_name, updated_at);

    CREATE TABLE IF NOT EXISTS table_editor_recent_views (
      id text PRIMARY KEY NOT NULL,
      connection_name text NOT NULL,
      active_table text NOT NULL,
      filter_column text,
      filter_mode text,
      filter_value text,
      filter_value_end text,
      view_key text NOT NULL,
      visited_at text NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_table_editor_recent_views_connection_view_key ON table_editor_recent_views (connection_name, view_key);
    CREATE INDEX IF NOT EXISTS idx_table_editor_recent_views_connection_visited ON table_editor_recent_views (connection_name, visited_at);

    CREATE TABLE IF NOT EXISTS table_foreign_key_display (
      id text PRIMARY KEY NOT NULL,
      connection_name text NOT NULL,
      schema_name text NOT NULL,
      table_name text NOT NULL,
      display_columns_json text NOT NULL,
      display_template text,
      created_at text NOT NULL,
      updated_at text NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_table_foreign_key_display_target
      ON table_foreign_key_display (connection_name, schema_name, table_name);
  `)
}
