import { z } from 'zod'
import { exportNotebookSpecV1ById, importNotebookSpecV1 } from '@/lib/notebook-db'
import { errorResponse } from '@/lib/api/errors'
import { nonEmptyStringSchema, parseWithSchema } from '@/lib/api/validation'
import {
  applyJsonPatch,
  formatZodIssuesAsApiDetails,
  notebookSpecV1Schema,
  patchNotebookSchema,
} from '@/lib/notebook-spec'
import { defineRoute } from '@/server/route'

const paramsSchema = z.object({
  id: nonEmptyStringSchema,
})

export default defineRoute({
  POST(req) {
    const { id } = parseWithSchema(paramsSchema, req.query)
    const patchParsed = patchNotebookSchema.safeParse(req.body || {})
    if (!patchParsed.success) {
      return errorResponse(422, {
        error: 'validation_failed',
        details: formatZodIssuesAsApiDetails(patchParsed.error),
      })
    }

    const current = exportNotebookSpecV1ById(id)
    const patched = applyJsonPatch(current, patchParsed.data.ops)

    const notebookParsed = notebookSpecV1Schema.safeParse(patched)
    if (!notebookParsed.success) {
      return errorResponse(422, {
        error: 'validation_failed',
        details: formatZodIssuesAsApiDetails(notebookParsed.error),
      })
    }

    const result = importNotebookSpecV1({
      mode: 'replace',
      targetNotebookId: id,
      notebook: notebookParsed.data,
      validateOnly: false,
    })

    return {
      ok: true,
      notebook_id: result.notebook_id,
      warnings: result.warnings,
      notebook: result.notebook,
    }
  },
})
