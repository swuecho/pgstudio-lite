import type { NextApiRequest, NextApiResponse } from 'next'
import { clearHistory, getHistory } from '../../lib/db'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const limit = Number(req.query.limit || 100)
    return res.status(200).json({ items: getHistory(limit) })
  }

  if (req.method === 'DELETE') {
    clearHistory()
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}
