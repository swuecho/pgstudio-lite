import { z } from 'zod'
import { getNotebookSchedule, upsertNotebookSchedule } from '@/lib/notebook-runs'
import { getNotebookById } from '@/lib/notebook-db'
import { errorResponse } from '@/lib/api/errors'
import { nonEmptyStringSchema, parseWithSchema } from '@/lib/api/validation'
import { defineRoute } from '@/server/route'

const paramsSchema = z.object({ id: nonEmptyStringSchema })
const putBodySchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z.number().int().positive(),
})

/** GET reads the notebook's schedule (disabled if never set); PUT replaces it. */
export default defineRoute({
  GET(req) {
    const { id } = parseWithSchema(paramsSchema, req.query)
    if (!getNotebookById(id)) return errorResponse(404, { error: 'notebook not found' })
    return { item: getNotebookSchedule(id) }
  },

  PUT(req) {
    const { id } = parseWithSchema(paramsSchema, req.query)
    const body = parseWithSchema(putBodySchema, req.body || {})
    return { item: upsertNotebookSchedule(id, body) }
  },
})
