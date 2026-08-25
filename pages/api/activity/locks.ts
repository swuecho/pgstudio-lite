import type { NextApiRequest, NextApiResponse } from 'next'
import { getActivityLocks } from '@/lib/db'
import { getRequestConnectionName } from '@/lib/api/connection'
import { methodNotAllowed, sendApiError } from '@/lib/api/errors'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
  try {
    const connectionName = getRequestConnectionName(req)
    const locks = await getActivityLocks(connectionName)
    return res.status(200).json({ locks, fetchedAt: new Date().toISOString() })
  } catch (error) {
    return sendApiError(res, error)
  }
}
