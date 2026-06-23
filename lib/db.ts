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

export { getPool, closePool } from './db/pool'
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
  lookupTableRow,
  getTableRows,
  listSchemaObjects,
  updateTableRowByPrimaryKey,
  insertTableRow,
  importTableRows,
  deleteTableRowByPrimaryKey,
  getIncomingForeignKeys,
  fetchRowsByMatch,
  type ForeignKeyOption,
  getForeignKeyOptions,
} from './db/tables'

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
