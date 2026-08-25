import type { NextApiRequest, NextApiResponse } from 'next'
import { importNotebookSpecV1 } from '@/lib/notebook-db'
import { methodNotAllowed, sendApiError } from '@/lib/api/errors'
import { formatZodIssuesAsApiDetails, importNotebookSchema } from '@/lib/notebook-spec'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  try {
    const parsed = importNotebookSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(422).json({
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
