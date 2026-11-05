import { z } from 'zod'
import { listNotebookRuns, runNotebookSnapshot } from '@/lib/notebook-runs'
import { getNotebookById } from '@/lib/notebook-db'
import { errorResponse } from '@/lib/api/errors'
import { nonEmptyStringSchema, parseWithSchema } from '@/lib/api/validation'
import { defineRoute } from '@/server/route'

const paramsSchema = z.object({ id: nonEmptyStringSchema })
const listQuerySchema = z.object({
  limit: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() ? Number(value) : undefined),
    z.number().int().min(1).max(200).optional()
  ),
})

/** GET lists a notebook's run history (newest first); POST runs the notebook now. */
export default defineRoute({
  GET(req) {
    const { id } = parseWithSchema(paramsSchema, req.query)
    if (!getNotebookById(id)) return errorResponse(404, { error: 'notebook not found' })
    const { limit } = parseWithSchema(listQuerySchema, req.query)
    return { items: listNotebookRuns(id, limit) }
  },

  async POST(req) {
    const { id } = parseWithSchema(paramsSchema, req.query)
    const run = await runNotebookSnapshot({ notebookId: id, trigger: 'manual' })
    return { item: run }
  },
})
