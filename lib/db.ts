export type { RelationKind } from './relation-kind'

export {
  type DbConnection,
  resolveConnectionName,
  getConnectionByName,
  getConnections,
  getPublicConnections,
  createConnection,
  updateConnection,
  setDefaultConnection,
  deleteConnection,
} from './db/connections'

export { getPool, closePool, closeAllPools } from './db/pool'
export { withClient } from './db/client'
export { sqlIdent } from './db/sql'

export {
  getHistory,
  clearHistory,
  getSnippets,
  saveSnippet,
  updateSnippet,
  deleteSnippet,
} from './db/history'

export {
  type TableInfo,
  type ColumnForeignKey,
  type ForeignKeyConstraint,
  type TableColumn,
  type SchemaTable,
  type IncomingForeignKey,
  getPrimaryKeyColumns,
  listTables,
  getTableForeignKeys,
  getTableColumns,
  listSchemaObjects,
  getIncomingForeignKeys,
} from './db/introspect'

export {
  lookupTableRow,
  getTableRows,
  updateTableRowByPrimaryKey,
  insertTableRow,
  deleteTableRowByPrimaryKey,
  fetchRowsByMatch,
} from './db/rows'

export { importTableRows } from './db/import'

export { type ForeignKeyOption, getForeignKeyOptions } from './db/foreign-key-options'

export { getTableDdl } from './db/table-ddl'

export { splitStatements, executeQuery } from './db/query'

export {
  getTableEditorViews,
  saveTableEditorBookmark,
  updateTableEditorBookmark,
  deleteTableEditorBookmark,
  recordTableEditorRecentView,
  clearTableEditorRecentViews,
  importTableEditorViewsFromLocalStorage,
} from './db/editor-views'

export {
  type ForeignKeyDisplayConfig,
  getForeignKeyDisplayConfig,
  saveForeignKeyDisplayConfig,
} from './db/foreign-key-display'

export {
  type ActivitySession,
  type ActivityLock,
  type ActivityStatement,
  type ActivityStatementsResult,
  getActivitySessions,
  getActivityLocks,
  getActivityStatements,
  installPgStatStatements,
  resetActivityStatements,
  controlBackend,
} from './db/activity'
