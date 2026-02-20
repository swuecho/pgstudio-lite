import type { NextApiRequest } from 'next'
import { parseWithSchema, optionalConnectionNameSchema } from './validation'

export function getRequestConnectionName(req: NextApiRequest) {
  const fromQuery = parseWithSchema(optionalConnectionNameSchema, req.query.connectionName)
  const fromBody = parseWithSchema(optionalConnectionNameSchema, req.body?.connectionName)
  return fromQuery || fromBody
}
