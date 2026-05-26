import type { NextApiRequest, NextApiResponse } from 'next'
import { getActivitySessions } from '../../../lib/db'
import { getRequestConnectionName } from '../../../lib/api/connection'
import { methodNotAllowed, sendApiError } from '../../../lib/api/errors'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
  try {
    const connectionName = getRequestConnectionName(req)
    const sessions = await getActivitySessions(connectionName)
    return res.status(200).json({ sessions, fetchedAt: new Date().toISOString() })
  } catch (error) {
    return sendApiError(res, error)
  }
}
