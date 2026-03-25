import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { runNotebookOptionQuery } from '../../../../lib/notebook-db'
import { methodNotAllowed, sendApiError } from '../../../../lib/api/errors'
import { nonEmptyStringSchema, parseWithSchema } from '../../../../lib/api/validation'

const paramsSchema = z.object({ id: nonEmptyStringSchema })
const optionQueryBodySchema = z.object({
  query: z.string().trim().min(1, 'query is required'),
  inputValues: z.record(z.string(), z.unknown()).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  try {
    const { id } = parseWithSchema(paramsSchema, req.query)
    const { query, inputValues } = parseWithSchema(optionQueryBodySchema, req.body || {})
    const result = await runNotebookOptionQuery({ notebookId: id, query, inputValues })
    return res.status(200).json(result)
  } catch (error) {
    return sendApiError(res, error)
  }
}
