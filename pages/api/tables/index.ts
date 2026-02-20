import type { NextApiRequest, NextApiResponse } from 'next'
import { listTables } from '../../../lib/db'
import { getRequestConnectionName } from '../../../lib/api/connection'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const connectionName = getRequestConnectionName(req)
    const tables = await listTables(connectionName)
    return res.status(200).json({ tables })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const statusCode = (error as { statusCode?: number })?.statusCode || 400
    return res.status(statusCode).json({ error: message })
  }
}
