import { z } from 'zod'
import { deleteNotebookRun, getNotebookRun } from '@/lib/notebook-runs'
import { errorResponse } from '@/lib/api/errors'
import { nonEmptyStringSchema, parseWithSchema } from '@/lib/api/validation'
import { defineRoute } from '@/server/route'

const paramsSchema = z.object({ id: nonEmptyStringSchema, runId: nonEmptyStringSchema })

/** GET returns one run with its full snapshot; DELETE removes it. */
export default defineRoute({
  GET(req) {
    const { id, runId } = parseWithSchema(paramsSchema, req.query)
    const run = getNotebookRun(id, runId)
    if (!run) return errorResponse(404, { error: 'run not found' })
    return { item: run }
  },

  DELETE(req) {
    const { id, runId } = parseWithSchema(paramsSchema, req.query)
    if (!deleteNotebookRun(id, runId)) return errorResponse(404, { error: 'run not found' })
    return { ok: true }
  },
})
