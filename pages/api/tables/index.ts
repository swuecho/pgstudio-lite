import type { NextApiRequest, NextApiResponse } from 'next'
import { listTables } from '../../../lib/db'
import { getRequestConnectionName } from '../../../lib/api/connection'
import { methodNotAllowed, sendApiError } from '../../../lib/api/errors'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET'])
  }

  try {
    const connectionName = getRequestConnectionName(req)
    const tables = await listTables(connectionName)
    return res.status(200).json({ tables })
  } catch (error) {
    return sendApiError(res, error)
  }
}
