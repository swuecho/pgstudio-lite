import type { ApiHandler } from './shim'

import activityControl from '@/pages/api/activity/control'
import activityLocks from '@/pages/api/activity/locks'
import activitySessions from '@/pages/api/activity/sessions'
import activityStatements from '@/pages/api/activity/statements'
import connections from '@/pages/api/connections'
import history from '@/pages/api/history'
import notebookById from '@/pages/api/notebooks/[id]'
import notebookCells from '@/pages/api/notebooks/[id]/cells'
import notebookExport from '@/pages/api/notebooks/[id]/export'
import notebookOptionQuery from '@/pages/api/notebooks/[id]/option-query'
import notebookPatch from '@/pages/api/notebooks/[id]/patch'
import notebookRunCell from '@/pages/api/notebooks/[id]/run-cell'
import notebookRunById from '@/pages/api/notebooks/[id]/runs/[runId]'
import notebookRuns from '@/pages/api/notebooks/[id]/runs'
import notebookSchedule from '@/pages/api/notebooks/[id]/schedule'
import notebooksGenerateTour from '@/pages/api/notebooks/generate-tour'
import notebooksImport from '@/pages/api/notebooks/import'
import notebooksIndex from '@/pages/api/notebooks/index'
import query from '@/pages/api/query'
import schemaColumns from '@/pages/api/schema/columns'
import schemaIndex from '@/pages/api/schema/index'
import snippets from '@/pages/api/snippets'
import tableEditorViews from '@/pages/api/table-editor-views'
import tableDdl from '@/pages/api/tables/[table]/ddl'
import tableFkDisplay from '@/pages/api/tables/[table]/fk-display'
import tableFkOptions from '@/pages/api/tables/[table]/fk-options'
import tableImport from '@/pages/api/tables/[table]/import'
import tableLookupRow from '@/pages/api/tables/[table]/lookup-row'
import tableRows from '@/pages/api/tables/[table]/rows'
import tablesIndex from '@/pages/api/tables/index'
import traceRow from '@/pages/api/trace/row'

export type Route = {
  /**
   * Canonical pattern. `:name` is a single dynamic segment (Next's `[name]`),
   * `*name` a catch-all (Next's `[...name]`).
   */
  pattern: string
  handler: ApiHandler
}

/**
 * Every `pages/api/**` handler, addressable by URL.
 *
 * Deliberately an explicit table rather than a filesystem walk: it is
 * greppable, type-checked, and survives bundling by esbuild.
 * `tests/desktop-routes.test.ts` asserts a bijection against `pages/api/**`,
 * so a new route that is not listed here fails the test suite instead of
 * 404ing in a shipped build.
 *
 * `/api/monaco/*` and `/api/vs/*` are absent on purpose — they are static file
 * servers, handled natively in electron/monaco.ts.
 */
export const routes: Route[] = [
  { pattern: '/api/query', handler: query as ApiHandler },
  { pattern: '/api/connections', handler: connections as ApiHandler },
  { pattern: '/api/history', handler: history as ApiHandler },
  { pattern: '/api/snippets', handler: snippets as ApiHandler },
  { pattern: '/api/table-editor-views', handler: tableEditorViews as ApiHandler },

  { pattern: '/api/schema', handler: schemaIndex as ApiHandler },
  { pattern: '/api/schema/columns', handler: schemaColumns as ApiHandler },

  { pattern: '/api/tables', handler: tablesIndex as ApiHandler },
  { pattern: '/api/tables/:table/rows', handler: tableRows as ApiHandler },
  { pattern: '/api/tables/:table/ddl', handler: tableDdl as ApiHandler },
  { pattern: '/api/tables/:table/fk-options', handler: tableFkOptions as ApiHandler },
  { pattern: '/api/tables/:table/fk-display', handler: tableFkDisplay as ApiHandler },
  { pattern: '/api/tables/:table/lookup-row', handler: tableLookupRow as ApiHandler },
  { pattern: '/api/tables/:table/import', handler: tableImport as ApiHandler },

  { pattern: '/api/activity/sessions', handler: activitySessions as ApiHandler },
  { pattern: '/api/activity/locks', handler: activityLocks as ApiHandler },
  { pattern: '/api/activity/statements', handler: activityStatements as ApiHandler },
  { pattern: '/api/activity/control', handler: activityControl as ApiHandler },

  { pattern: '/api/trace/row', handler: traceRow as ApiHandler },

  // Static siblings must out-rank `/api/notebooks/:id`, or importing a notebook
  // would be read as loading one with id "import". matchRoute() sorts by
  // specificity so declaration order here is not load-bearing.
  { pattern: '/api/notebooks', handler: notebooksIndex as ApiHandler },
  { pattern: '/api/notebooks/import', handler: notebooksImport as ApiHandler },
  { pattern: '/api/notebooks/generate-tour', handler: notebooksGenerateTour as ApiHandler },
  { pattern: '/api/notebooks/:id', handler: notebookById as ApiHandler },
  { pattern: '/api/notebooks/:id/cells', handler: notebookCells as ApiHandler },
  { pattern: '/api/notebooks/:id/export', handler: notebookExport as ApiHandler },
  { pattern: '/api/notebooks/:id/patch', handler: notebookPatch as ApiHandler },
  { pattern: '/api/notebooks/:id/run-cell', handler: notebookRunCell as ApiHandler },
  { pattern: '/api/notebooks/:id/runs', handler: notebookRuns as ApiHandler },
  { pattern: '/api/notebooks/:id/runs/:runId', handler: notebookRunById as ApiHandler },
  { pattern: '/api/notebooks/:id/schedule', handler: notebookSchedule as ApiHandler },
  { pattern: '/api/notebooks/:id/option-query', handler: notebookOptionQuery as ApiHandler },
]
