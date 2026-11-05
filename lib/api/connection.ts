import { optionalConnectionNameSchema, parseWithSchema } from './validation'

/** Connection name from `?connectionName=` or the JSON body, query first. */
export function getRequestConnectionName(req: { query: Record<string, unknown>; body?: unknown }) {
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : undefined
  const fromQuery = parseWithSchema(optionalConnectionNameSchema, req.query.connectionName)
  const fromBody = parseWithSchema(optionalConnectionNameSchema, body?.connectionName)
  return fromQuery || fromBody
}
