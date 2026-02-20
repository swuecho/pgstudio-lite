import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const dbConnections = sqliteTable(
  'db_connections',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    connectionString: text('connection_string').notNull(),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    readOnly: integer('read_only', { mode: 'boolean' }).notNull().default(false),
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

export const notebooks = sqliteTable(
  'notebooks',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    connectionName: text('connection_name').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    updatedAtIdx: index('idx_notebooks_updated_at').on(table.updatedAt),
  })
)

export const notebookCells = sqliteTable(
  'notebook_cells',
  {
    id: text('id').primaryKey(),
    notebookId: text('notebook_id').notNull(),
    position: integer('position').notNull(),
    type: text('type').notNull(),
    content: text('content').notNull(),
    collapsed: integer('collapsed', { mode: 'boolean' }).notNull().default(false),
    lastRunStatus: text('last_run_status'),
    lastRunAt: text('last_run_at'),
    lastDurationMs: integer('last_duration_ms'),
    lastRowCount: integer('last_row_count'),
    lastResultJson: text('last_result_json'),
    lastError: text('last_error'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    notebookPositionIdx: uniqueIndex('idx_notebook_cells_notebook_position').on(table.notebookId, table.position),
    notebookUpdatedAtIdx: index('idx_notebook_cells_updated_at').on(table.updatedAt),
  })
)
