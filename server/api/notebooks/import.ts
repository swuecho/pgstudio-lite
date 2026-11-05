import { importNotebookSpecV1 } from '@/lib/notebook-db'
import { errorResponse } from '@/lib/api/errors'
import { formatZodIssuesAsApiDetails, importNotebookSchema } from '@/lib/notebook-spec'
import { defineRoute } from '@/server/route'

export default defineRoute({
  POST(req) {
    const parsed = importNotebookSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return errorResponse(422, {
        error: 'validation_failed',
        details: formatZodIssuesAsApiDetails(parsed.error),
      })
    }

    const result = importNotebookSpecV1({
      mode: parsed.data.mode,
      targetNotebookId: parsed.data.target_notebook_id,
      notebook: parsed.data.notebook,
      validateOnly: parsed.data.validate_only,
    })
    return {
      ok: true,
      notebook_id: result.notebook_id,
      warnings: result.warnings,
      notebook: result.notebook,
    }
  },
})
