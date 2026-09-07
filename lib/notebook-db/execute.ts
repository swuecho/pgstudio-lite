import { and, eq } from 'drizzle-orm'
import { notebookCells, notebooks } from '@/drizzle/schema'
import { executeQuery } from '@/lib/db'
import { getMetaDb } from '@/lib/meta-db'
import {
  buildExecutedQueryInfo,
  compileSqlTemplate,
  extractTemplateKeys,
  type ExecutedQueryInfo,
} from '@/lib/notebook-params'
import { getWidgetParamValues, isWidgetMetadata } from '@/lib/notebook-widgets'
import { notebookDbError, toNotebookCell } from './shared'

/**
 * Runs a SQL cell against the notebook's connection, resolving `{{key}}`
 * templates from the request's input values and the notebook's widget cells,
 * then records the outcome on the cell row.
 */
export async function runNotebookSqlCell(input: {
  notebookId: string
  cellId: string
  query: string
  inputValues?: Record<string, unknown>
}) {
  const notebook = getMetaDb().select().from(notebooks).where(eq(notebooks.id, input.notebookId)).get()
  if (!notebook) throw notebookDbError(404, 'notebook not found')
  const cell = getMetaDb()
    .select()
    .from(notebookCells)
    .where(and(eq(notebookCells.id, input.cellId), eq(notebookCells.notebookId, input.notebookId)))
    .get()
  if (!cell) throw notebookDbError(404, 'cell not found')
  if (cell.type !== 'sql') throw notebookDbError(400, 'only sql cells can be executed')

  const now = new Date().toISOString()
  try {
    const templateKeys = extractTemplateKeys(input.query)
    const notebookCellsWithMetadata = getMetaDb()
      .select()
      .from(notebookCells)
      .where(eq(notebookCells.notebookId, input.notebookId))
      .all()
      .map(toNotebookCell)

    const widgetValueByKey = new Map<string, unknown>()
    for (const currentCell of notebookCellsWithMetadata) {
      const metadata = currentCell.metadata_json
      if (!metadata) continue
      if (currentCell.type === 'widget' && isWidgetMetadata(metadata)) {
        for (const [key, value] of Object.entries(getWidgetParamValues(metadata))) {
          widgetValueByKey.set(key, value)
        }
      }
    }

    let compiledQueryText = input.query
    let compiledValues: unknown[] | undefined
    let executedQuery: ExecutedQueryInfo | undefined
    if (templateKeys.length > 0) {
      const resolvedValues: Record<string, unknown> = {}
      const sourceByKey: Record<string, 'request' | 'widget'> = {}
      for (const key of templateKeys) {
        if (widgetValueByKey.has(key)) {
          const requestValue = input.inputValues?.[key]
          if (requestValue !== undefined && requestValue !== null) {
            resolvedValues[key] = requestValue
            sourceByKey[key] = 'request'
          } else {
            resolvedValues[key] = widgetValueByKey.get(key)
            sourceByKey[key] = 'widget'
          }
          continue
        }
        if (input.inputValues && key in input.inputValues) {
          resolvedValues[key] = input.inputValues[key]
          sourceByKey[key] = 'request'
          continue
        }
        throw notebookDbError(400, `Unknown input key '{{${key}}}'`)
      }
      const compiled = compileSqlTemplate(input.query, resolvedValues)
      compiledQueryText = compiled.text
      compiledValues = compiled.values
      executedQuery = buildExecutedQueryInfo({ ...compiled, sourceByKey })
    }

    const executed = await executeQuery({
      query: compiledQueryText,
      connectionName: notebook.connectionName,
      values: compiledValues,
    })
    const result = executedQuery ? { ...executed, executedQuery } : executed
    getMetaDb()
      .update(notebookCells)
      .set({
        lastRunStatus: 'success',
        lastRunAt: now,
        lastDurationMs: result.durationMs,
        lastRowCount: result.totalRows,
        lastResultJson: JSON.stringify(result),
        lastError: null,
        updatedAt: now,
      })
      .where(eq(notebookCells.id, input.cellId))
      .run()
    getMetaDb().update(notebooks).set({ updatedAt: now }).where(eq(notebooks.id, input.notebookId)).run()
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    getMetaDb()
      .update(notebookCells)
      .set({
        lastRunStatus: 'error',
        lastRunAt: now,
        lastDurationMs: null,
        lastRowCount: null,
        lastResultJson: null,
        lastError: message,
        updatedAt: now,
      })
      .where(eq(notebookCells.id, input.cellId))
      .run()
    getMetaDb().update(notebooks).set({ updatedAt: now }).where(eq(notebooks.id, input.notebookId)).run()
    throw error
  }
}

/**
 * Runs a widget's option-source query. Unlike `runNotebookSqlCell`, every
 * template key must be supplied explicitly and nothing is recorded.
 */
export async function runNotebookOptionQuery(input: {
  notebookId: string
  query: string
  inputValues?: Record<string, unknown>
}) {
  const notebook = getMetaDb().select().from(notebooks).where(eq(notebooks.id, input.notebookId)).get()
  if (!notebook) throw notebookDbError(404, 'notebook not found')

  const templateKeys = extractTemplateKeys(input.query)
  let compiledQueryText = input.query
  let compiledValues: unknown[] | undefined

  if (templateKeys.length > 0) {
    const resolvedValues: Record<string, unknown> = {}
    for (const key of templateKeys) {
      if (!(key in (input.inputValues || {}))) {
        throw notebookDbError(400, `Unknown input key '{{${key}}}'`)
      }
      resolvedValues[key] = input.inputValues?.[key]
    }
    const compiled = compileSqlTemplate(input.query, resolvedValues)
    compiledQueryText = compiled.text
    compiledValues = compiled.values
  }

  return executeQuery({
    query: compiledQueryText,
    connectionName: notebook.connectionName,
    values: compiledValues,
  })
}
