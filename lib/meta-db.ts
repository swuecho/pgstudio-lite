import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import BetterSqlite3 from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../drizzle/schema'

const DATA_DIR = join(process.cwd(), 'data')
const DB_PATH = join(DATA_DIR, 'history.db')

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

export const sqlite = new BetterSqlite3(DB_PATH)
sqlite.pragma('journal_mode = WAL')

// Defensive bootstrap for local/dev environments where migration ordering can drift.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS notebooks (
    id text PRIMARY KEY NOT NULL,
    title text NOT NULL,
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

const hasLastResultJsonColumn = sqlite
  .prepare(`SELECT 1 FROM pragma_table_info('notebook_cells') WHERE name = 'last_result_json' LIMIT 1`)
  .get()
if (!hasLastResultJsonColumn) {
  sqlite.exec(`ALTER TABLE notebook_cells ADD COLUMN last_result_json text;`)
}

const hasQuerySnippetsTable = sqlite
  .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'query_snippets' LIMIT 1`)
  .get()
if (hasQuerySnippetsTable) {
  const hasSnippetConnectionColumn = sqlite
    .prepare(`SELECT 1 FROM pragma_table_info('query_snippets') WHERE name = 'connection_name' LIMIT 1`)
    .get()
  if (!hasSnippetConnectionColumn) {
    sqlite.exec(`ALTER TABLE query_snippets ADD COLUMN connection_name text;`)
  }

  const hasDbConnectionsTable = sqlite
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'db_connections' LIMIT 1`)
    .get()
  if (hasDbConnectionsTable) {
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

// Handle dev drift where metadata_json exists already but 0006 is not yet registered.
const hasNotebookMetadataJsonColumn = sqlite
  .prepare(`SELECT 1 FROM pragma_table_info('notebook_cells') WHERE name = 'metadata_json' LIMIT 1`)
  .get()
if (hasNotebookMetadataJsonColumn) {
  const hasMigrationsTable = sqlite
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations' LIMIT 1`)
    .get()
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

export const metaDb = drizzle(sqlite, { schema })

migrate(metaDb, { migrationsFolder: join(process.cwd(), 'drizzle/migrations') })
