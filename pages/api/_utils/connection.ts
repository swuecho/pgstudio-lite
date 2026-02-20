import type { NextApiRequest } from 'next'

export function getRequestConnectionName(req: NextApiRequest) {
  const fromQuery = typeof req.query.connectionName === 'string' ? req.query.connectionName : undefined
  const fromBody = typeof req.body?.connectionName === 'string' ? req.body.connectionName : undefined
  return fromQuery || fromBody
}
