import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { clearHistory, getHistory } from '../../lib/db'
import { getRequestConnectionName } from '../../lib/api/connection'
import { parseWithSchema } from '../../lib/api/validation'
import { methodNotAllowed, sendApiError } from '../../lib/api/errors'

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
})

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const { limit } = parseWithSchema(historyQuerySchema, req.query)
      const connectionName = getRequestConnectionName(req)
      return res.status(200).json({ items: getHistory(limit, connectionName) })
    }

    if (req.method === 'DELETE') {
      const connectionName = getRequestConnectionName(req)
      clearHistory(connectionName)
      return res.status(200).json({ ok: true })
    }
  } catch (error) {
    return sendApiError(res, error)
  }

  return methodNotAllowed(res, ['GET', 'DELETE'])
}
