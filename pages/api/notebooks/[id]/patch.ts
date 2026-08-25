import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { exportNotebookSpecV1ById, importNotebookSpecV1 } from '@/lib/notebook-db'
import { methodNotAllowed, sendApiError } from '@/lib/api/errors'
import { nonEmptyStringSchema, parseWithSchema } from '@/lib/api/validation'
import {
  applyJsonPatch,
  formatZodIssuesAsApiDetails,
  notebookSpecV1Schema,
  patchNotebookSchema,
} from '@/lib/notebook-spec'

const paramsSchema = z.object({
  id: nonEmptyStringSchema,
})

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  try {
    const { id } = parseWithSchema(paramsSchema, req.query)
    const patchParsed = patchNotebookSchema.safeParse(req.body || {})
    if (!patchParsed.success) {
      return res.status(422).json({
        error: 'validation_failed',
        details: formatZodIssuesAsApiDetails(patchParsed.error),
      })
    }

    const current = exportNotebookSpecV1ById(id)
    const patched = applyJsonPatch(current, patchParsed.data.ops)

    const notebookParsed = notebookSpecV1Schema.safeParse(patched)
    if (!notebookParsed.success) {
      return res.status(422).json({
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

    return res.status(200).json({
      ok: true,
      notebook_id: result.notebook_id,
      warnings: result.warnings,
      notebook: result.notebook,
    })
  } catch (error) {
    return sendApiError(res, error)
  }
}
