/**
 * Notebook metadata store (SQLite). Split by concern under lib/notebook-db/;
 * this barrel keeps the import path stable.
 */
export type { NotebookCellType, Notebook, NotebookSpecV1, NotebookSpecV1Cell } from './notebook-types'

export type { NotebookCell, NotebookStoredWidgetMetadata } from './notebook-db/shared'

export {
  listNotebooks,
  createNotebook,
  updateNotebook,
  deleteNotebook,
  getNotebookById,
} from './notebook-db/notebooks'

export { createNotebookCell, updateNotebookCell, deleteNotebookCell } from './notebook-db/cells'

export { importNotebookSpecV1, exportNotebookSpecV1ById } from './notebook-db/spec'

export { runNotebookSqlCell, runNotebookOptionQuery } from './notebook-db/execute'
