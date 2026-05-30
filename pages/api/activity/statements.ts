import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { getActivityStatements, installPgStatStatements, resetActivityStatements } from '../../../lib/db'
import { getRequestConnectionName } from '../../../lib/api/connection'
import { parseWithSchema } from '../../../lib/api/validation'
import { methodNotAllowed, sendApiError } from '../../../lib/api/errors'

const orderSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined),
  z.enum(['total', 'mean', 'calls']).optional()
)

const postBodySchema = z.object({
  action: z.enum(['install', 'reset']),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const connectionName = getRequestConnectionName(req)

  if (req.method === 'GET') {
    try {
      const orderBy = parseWithSchema(orderSchema, req.query.orderBy)
      const result = await getActivityStatements(connectionName, { orderBy })
      return res.status(200).json({ ...result, fetchedAt: new Date().toISOString() })
    } catch (error) {
      return sendApiError(res, error)
    }
  }

  if (req.method === 'POST') {
    try {
      const { action } = parseWithSchema(postBodySchema, req.body || {})
      if (action === 'install') {
        await installPgStatStatements(connectionName)
      } else {
        await resetActivityStatements(connectionName)
      }
      return res.status(200).json({ ok: true })
    } catch (error) {
      return sendApiError(res, error)
    }
  }

  return methodNotAllowed(res, ['GET', 'POST'])
}
