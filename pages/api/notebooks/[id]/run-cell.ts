import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { runNotebookSqlCell } from '../../../../lib/notebook-db'
import { nonEmptyStringSchema, parseWithSchema } from '../../../../lib/api/validation'

const paramsSchema = z.object({ id: nonEmptyStringSchema })
const runCellBodySchema = z.object({
  cellId: nonEmptyStringSchema,
  query: z.string().trim().min(1, 'query is required'),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { id } = parseWithSchema(paramsSchema, req.query)
    const { cellId, query } = parseWithSchema(runCellBodySchema, req.body || {})
    const result = await runNotebookSqlCell({ notebookId: id, cellId, query })
    return res.status(200).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const statusCode = (error as { statusCode?: number })?.statusCode || 400
    return res.status(statusCode).json({ error: message })
  }
}
