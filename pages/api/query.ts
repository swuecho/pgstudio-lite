import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { executeQuery } from '@/lib/db'
import { getRequestConnectionName } from '@/lib/api/connection'
import { parseWithSchema } from '@/lib/api/validation'
import { methodNotAllowed, sendApiError } from '@/lib/api/errors'

const queryBodySchema = z.object({
  query: z
    .string()
    .min(1, 'query is required')
    .refine((value) => Boolean(value.trim()), 'query is required'),
  rowLimit: z.number().int().min(1).max(500).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  try {
    const { query, rowLimit } = parseWithSchema(queryBodySchema, req.body || {})
    const connectionName = getRequestConnectionName(req)
    const result = await executeQuery({
      query,
      connectionName,
      ...(rowLimit === undefined ? {} : { rowLimit }),
    })
    return res.status(200).json(result)
  } catch (error) {
    return sendApiError(res, error)
  }
}
