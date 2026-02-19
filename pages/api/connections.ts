import type { NextApiRequest, NextApiResponse } from 'next'
import { getConnections } from '../../lib/db'

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const connections = getConnections()
  return res.status(200).json({
    connections: connections.map((c) => ({ name: c.name })),
    configured: connections.length > 0,
  })
}
