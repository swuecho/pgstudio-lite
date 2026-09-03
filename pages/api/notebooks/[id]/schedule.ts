import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { getNotebookSchedule, upsertNotebookSchedule } from '@/lib/notebook-runs'
import { getNotebookById } from '@/lib/notebook-db'
import { methodNotAllowed, sendApiError } from '@/lib/api/errors'
import { nonEmptyStringSchema, parseWithSchema } from '@/lib/api/validation'

const paramsSchema = z.object({ id: nonEmptyStringSchema })
const putBodySchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z.number().int().positive(),
})

/** GET reads the notebook's schedule (disabled if never set); PUT replaces it. */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = parseWithSchema(paramsSchema, req.query)

    if (req.method === 'GET') {
      if (!getNotebookById(id)) return res.status(404).json({ error: 'notebook not found' })
      return res.status(200).json({ item: getNotebookSchedule(id) })
    }

    if (req.method === 'PUT') {
      const body = parseWithSchema(putBodySchema, req.body || {})
      return res.status(200).json({ item: upsertNotebookSchedule(id, body) })
    }

    return methodNotAllowed(res, ['GET', 'PUT'])
  } catch (error) {
    return sendApiError(res, error)
  }
}
