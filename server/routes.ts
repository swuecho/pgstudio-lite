import type { RouteDefinition } from './route'

import activityControl from './api/activity/control'
import activityLocks from './api/activity/locks'
import activitySessions from './api/activity/sessions'
import activityStatements from './api/activity/statements'
import connections from './api/connections'
import history from './api/history'
import metaBackup from './api/meta-backup'
import notebookById from './api/notebooks/[id]'
import notebookCells from './api/notebooks/[id]/cells'
import notebookExport from './api/notebooks/[id]/export'
import notebookOptionQuery from './api/notebooks/[id]/option-query'
import notebookPatch from './api/notebooks/[id]/patch'
import notebookRunCell from './api/notebooks/[id]/run-cell'
import notebookRunById from './api/notebooks/[id]/runs/[runId]'
import notebookRuns from './api/notebooks/[id]/runs'
import notebookSchedule from './api/notebooks/[id]/schedule'
import notebooksGenerateTour from './api/notebooks/generate-tour'
import notebooksImport from './api/notebooks/import'
import notebooksIndex from './api/notebooks/index'
import query from './api/query'
import schemaColumns from './api/schema/columns'
import schemaIndex from './api/schema/index'
import snippets from './api/snippets'
import tableEditorViews from './api/table-editor-views'
import tableDdl from './api/tables/[table]/ddl'
import tableFkDisplay from './api/tables/[table]/fk-display'
import tableFkOptions from './api/tables/[table]/fk-options'
import tableImport from './api/tables/[table]/import'
import tableLookupRow from './api/tables/[table]/lookup-row'
import tableRows from './api/tables/[table]/rows'
import tablesIndex from './api/tables/index'
import traceRow from './api/trace/row'

export type Route = {
  /**
   * Canonical pattern. `:name` is a single dynamic segment (`[name]` in the
   * file path), `*name` a catch-all.
   */
  pattern: string
  handler: RouteDefinition
}

/**
 * Every `server/api/**` route, addressable by URL. File paths mirror the URL,
 * with `[name]` for a dynamic segment.
 *
 * Deliberately an explicit table rather than a filesystem walk: it is
 * greppable, type-checked, and survives bundling by esbuild and Vite.
 * `tests/api-routes.test.ts` asserts a bijection against `server/api/**`,
 * so a new route that is not listed here fails the test suite instead of
 * 404ing.
 *
 * `/api/monaco/*` and `/api/vs/*` are absent on purpose — they are static file
 * servers, handled in server/monaco.ts.
 */
export const routes: Route[] = [
  { pattern: '/api/query', handler: query },
  { pattern: '/api/connections', handler: connections },
  { pattern: '/api/history', handler: history },
  { pattern: '/api/snippets', handler: snippets },
  { pattern: '/api/table-editor-views', handler: tableEditorViews },
  { pattern: '/api/meta-backup', handler: metaBackup },

  { pattern: '/api/schema', handler: schemaIndex },
  { pattern: '/api/schema/columns', handler: schemaColumns },

  { pattern: '/api/tables', handler: tablesIndex },
  { pattern: '/api/tables/:table/rows', handler: tableRows },
  { pattern: '/api/tables/:table/ddl', handler: tableDdl },
  { pattern: '/api/tables/:table/fk-options', handler: tableFkOptions },
  { pattern: '/api/tables/:table/fk-display', handler: tableFkDisplay },
  { pattern: '/api/tables/:table/lookup-row', handler: tableLookupRow },
  { pattern: '/api/tables/:table/import', handler: tableImport },

  { pattern: '/api/activity/sessions', handler: activitySessions },
  { pattern: '/api/activity/locks', handler: activityLocks },
  { pattern: '/api/activity/statements', handler: activityStatements },
  { pattern: '/api/activity/control', handler: activityControl },

  { pattern: '/api/trace/row', handler: traceRow },

  // Static siblings must out-rank `/api/notebooks/:id`, or importing a notebook
  // would be read as loading one with id "import". matchRoute() sorts by
  // specificity so declaration order here is not load-bearing.
  { pattern: '/api/notebooks', handler: notebooksIndex },
  { pattern: '/api/notebooks/import', handler: notebooksImport },
  { pattern: '/api/notebooks/generate-tour', handler: notebooksGenerateTour },
  { pattern: '/api/notebooks/:id', handler: notebookById },
  { pattern: '/api/notebooks/:id/cells', handler: notebookCells },
  { pattern: '/api/notebooks/:id/export', handler: notebookExport },
  { pattern: '/api/notebooks/:id/patch', handler: notebookPatch },
  { pattern: '/api/notebooks/:id/run-cell', handler: notebookRunCell },
  { pattern: '/api/notebooks/:id/runs', handler: notebookRuns },
  { pattern: '/api/notebooks/:id/runs/:runId', handler: notebookRunById },
  { pattern: '/api/notebooks/:id/schedule', handler: notebookSchedule },
  { pattern: '/api/notebooks/:id/option-query', handler: notebookOptionQuery },
]
