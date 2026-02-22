import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { exportNotebookSpecV1ById } from '../../../../lib/notebook-db'
import { methodNotAllowed, sendApiError } from '../../../../lib/api/errors'
import { nonEmptyStringSchema, parseWithSchema } from '../../../../lib/api/validation'

const paramsSchema = z.object({
  id: nonEmptyStringSchema,
})

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET'])
  }

  try {
    const { id } = parseWithSchema(paramsSchema, req.query)
    return res.status(200).json(exportNotebookSpecV1ById(id))
  } catch (error) {
    return sendApiError(res, error)
  }
}
