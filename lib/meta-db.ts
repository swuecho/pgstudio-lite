import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
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

export const metaDb = drizzle(sqlite, { schema })

migrate(metaDb, { migrationsFolder: join(process.cwd(), 'drizzle/migrations') })
