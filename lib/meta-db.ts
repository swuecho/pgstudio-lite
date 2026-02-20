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

export const metaDb = drizzle(sqlite, { schema })

migrate(metaDb, { migrationsFolder: join(process.cwd(), 'drizzle/migrations') })
