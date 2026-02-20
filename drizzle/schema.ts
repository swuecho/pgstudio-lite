import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const dbConnections = sqliteTable(
  'db_connections',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    connectionString: text('connection_string').notNull(),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    nameUniqueIdx: uniqueIndex('idx_db_connections_name').on(table.name),
    defaultIdx: index('idx_db_connections_default').on(table.isDefault),
  })
)

export const queryHistory = sqliteTable(
  'query_history',
  {
    id: text('id').primaryKey(),
    connectionName: text('connection_name').notNull(),
    queryText: text('query_text').notNull(),
    status: text('status').notNull(),
    durationMs: integer('duration_ms').notNull(),
    rowCount: integer('row_count'),
    errorText: text('error_text'),
    executedAt: text('executed_at').notNull(),
    startedAt: text('started_at').notNull(),
    metadataJson: text('metadata_json'),
  },
  (table) => ({
    executedAtIdx: index('idx_query_history_executed_at').on(table.executedAt),
  })
)

export const querySnippets = sqliteTable(
  'query_snippets',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    queryText: text('query_text').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    updatedAtIdx: index('idx_query_snippets_updated_at').on(table.updatedAt),
  })
)
