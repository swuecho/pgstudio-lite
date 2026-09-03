import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { deleteNotebookRun, getNotebookRun } from '@/lib/notebook-runs'
import { methodNotAllowed, sendApiError } from '@/lib/api/errors'
import { nonEmptyStringSchema, parseWithSchema } from '@/lib/api/validation'

const paramsSchema = z.object({ id: nonEmptyStringSchema, runId: nonEmptyStringSchema })

/** GET returns one run with its full snapshot; DELETE removes it. */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id, runId } = parseWithSchema(paramsSchema, req.query)

    if (req.method === 'GET') {
      const run = getNotebookRun(id, runId)
      if (!run) return res.status(404).json({ error: 'run not found' })
      return res.status(200).json({ item: run })
    }

    if (req.method === 'DELETE') {
      if (!deleteNotebookRun(id, runId)) return res.status(404).json({ error: 'run not found' })
      return res.status(200).json({ ok: true })
    }

    return methodNotAllowed(res, ['GET', 'DELETE'])
  } catch (error) {
    return sendApiError(res, error)
  }
}
