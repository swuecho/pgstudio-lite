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

  if (process.env.SKIP_RUNTIME_MIGRATE !== '1') {
    migrate(metaDb, { migrationsFolder: join(process.cwd(), 'drizzle/migrations') })
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
