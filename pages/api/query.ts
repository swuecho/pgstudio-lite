import type { NextApiRequest, NextApiResponse } from 'next'
import { executeQuery } from '../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const query = typeof req.body?.query === 'string' ? req.body.query.trim() : ''
  const connectionName =
    typeof req.body?.connectionName === 'string' ? req.body.connectionName : 'default'

  if (!query) return res.status(400).json({ error: 'query is required' })

  try {
    const result = await executeQuery({ query, connectionName })
    return res.status(200).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const statusCode = (error as { statusCode?: number })?.statusCode || 400
    return res.status(statusCode).json({ error: message })
  }
}
