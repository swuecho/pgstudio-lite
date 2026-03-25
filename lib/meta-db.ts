import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import BetterSqlite3 from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../drizzle/schema'
import { getMetaDbDir, getMetaDbPath } from './meta-db-path'

const DB_PATH = getMetaDbPath()
const DATA_DIR = getMetaDbDir()

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

export const sqlite = new BetterSqlite3(DB_PATH)
sqlite.pragma('journal_mode = WAL')

function hasTable(name: string) {
  return Boolean(
    sqlite.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`).get(name)
  )
}

function hasColumn(table: string, column: string) {
  return Boolean(
    sqlite
      .prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ? LIMIT 1`)
      .get(table, column)
  )
}

export const metaDb = drizzle(sqlite, { schema })

export function ensureMetaDbReady() {
  const isTestRuntime = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test')
  // Handle dev drift where metadata_json exists already but 0006 is not yet registered.
  const hasNotebookMetadataJsonColumn =
    hasTable('notebook_cells') && hasColumn('notebook_cells', 'metadata_json')
  if (hasNotebookMetadataJsonColumn) {
    const hasMigrationsTable = hasTable('__drizzle_migrations')
    if (hasMigrationsTable) {
      const migrationPath = join(process.cwd(), 'drizzle/migrations/0006_input_cell_metadata.sql')
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
    migrate(metaDb, { migrationsFolder: join(process.cwd(), 'drizzle/migrations') })
  }

  if (isTestRuntime) {
    ensureBaseTables()
  }

  if (hasTable('notebook_cells') && !hasColumn('notebook_cells', 'last_result_json')) {
    sqlite.exec(`ALTER TABLE notebook_cells ADD COLUMN last_result_json text;`)
  }

  if (hasTable('notebooks') && !hasColumn('notebooks', 'metadata_json')) {
    sqlite.exec(`ALTER TABLE notebooks ADD COLUMN metadata_json text NOT NULL DEFAULT '{}';`)
    sqlite.exec(`UPDATE notebooks SET metadata_json = '{}' WHERE metadata_json IS NULL OR trim(metadata_json) = '';`)
  }

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

ensureMetaDbReady()

function ensureBaseTables() {
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

    CREATE TABLE IF NOT EXISTS notebook_cells (
      id text PRIMARY KEY NOT NULL,
      notebook_id text NOT NULL,
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
  `)
}
