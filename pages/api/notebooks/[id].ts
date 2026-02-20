import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { getNotebookById } from '../../../lib/notebook-db'
import { nonEmptyStringSchema, parseWithSchema } from '../../../lib/api/validation'

const paramsSchema = z.object({
  id: nonEmptyStringSchema,
})

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { id } = parseWithSchema(paramsSchema, req.query)
    const data = getNotebookById(id)
    if (!data) return res.status(404).json({ error: 'notebook not found' })
    return res.status(200).json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const statusCode = (error as { statusCode?: number })?.statusCode || 400
    return res.status(statusCode).json({ error: message })
  }
}
