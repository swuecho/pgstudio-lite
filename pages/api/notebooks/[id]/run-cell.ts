import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { runNotebookSqlCell } from '../../../../lib/notebook-db'
import { methodNotAllowed, sendApiError } from '../../../../lib/api/errors'
import { nonEmptyStringSchema, parseWithSchema } from '../../../../lib/api/validation'

const paramsSchema = z.object({ id: nonEmptyStringSchema })
const runCellBodySchema = z.object({
  cellId: nonEmptyStringSchema,
  query: z.string().trim().min(1, 'query is required'),
  inputValues: z.record(z.string(), z.unknown()).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  try {
    const { id } = parseWithSchema(paramsSchema, req.query)
    const { cellId, query, inputValues } = parseWithSchema(runCellBodySchema, req.body || {})
    const result = await runNotebookSqlCell({ notebookId: id, cellId, query, inputValues })
    return res.status(200).json(result)
  } catch (error) {
    return sendApiError(res, error)
  }
}
