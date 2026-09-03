import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { listNotebookRuns, runNotebookSnapshot } from '@/lib/notebook-runs'
import { getNotebookById } from '@/lib/notebook-db'
import { methodNotAllowed, sendApiError } from '@/lib/api/errors'
import { nonEmptyStringSchema, parseWithSchema } from '@/lib/api/validation'

const paramsSchema = z.object({ id: nonEmptyStringSchema })
const listQuerySchema = z.object({
  limit: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() ? Number(value) : undefined),
    z.number().int().min(1).max(200).optional()
  ),
})

/** GET lists a notebook's run history (newest first); POST runs the notebook now. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = parseWithSchema(paramsSchema, req.query)

    if (req.method === 'GET') {
      if (!getNotebookById(id)) return res.status(404).json({ error: 'notebook not found' })
      const { limit } = parseWithSchema(listQuerySchema, req.query)
      return res.status(200).json({ items: listNotebookRuns(id, limit) })
    }

    if (req.method === 'POST') {
      const run = await runNotebookSnapshot({ notebookId: id, trigger: 'manual' })
      return res.status(200).json({ item: run })
    }

    return methodNotAllowed(res, ['GET', 'POST'])
  } catch (error) {
    return sendApiError(res, error)
  }
}
