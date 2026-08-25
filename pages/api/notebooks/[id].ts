import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { getNotebookById } from '@/lib/notebook-db'
import { methodNotAllowed, sendApiError } from '@/lib/api/errors'
import { nonEmptyStringSchema, parseWithSchema } from '@/lib/api/validation'

const paramsSchema = z.object({
  id: nonEmptyStringSchema,
})

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET'])
  }

  try {
    const { id } = parseWithSchema(paramsSchema, req.query)
    const data = getNotebookById(id)
    if (!data) return res.status(404).json({ error: 'notebook not found' })
    return res.status(200).json(data)
  } catch (error) {
    return sendApiError(res, error)
  }
}
