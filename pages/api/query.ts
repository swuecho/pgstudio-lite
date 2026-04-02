import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { executeQuery } from '../../lib/db'
import { getRequestConnectionName } from '../../lib/api/connection'
import { parseWithSchema } from '../../lib/api/validation'
import { methodNotAllowed, sendApiError } from '../../lib/api/errors'

const queryBodySchema = z.object({
  query: z.string().trim().min(1, 'query is required'),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  try {
    const { query } = parseWithSchema(queryBodySchema, req.body || {})
    const connectionName = getRequestConnectionName(req)
    const result = await executeQuery({ query, connectionName })
    return res.status(200).json(result)
  } catch (error) {
    return sendApiError(res, error)
  }
}
