import type { NextApiRequest, NextApiResponse } from 'next'
import { clearHistory, getHistory } from '../../lib/db'
import { getRequestConnectionName } from './_utils/connection'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const limit = Number(req.query.limit || 100)
    const connectionName = getRequestConnectionName(req)
    return res.status(200).json({ items: getHistory(limit, connectionName) })
  }

  if (req.method === 'DELETE') {
    const connectionName = getRequestConnectionName(req)
    clearHistory(connectionName)
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}
