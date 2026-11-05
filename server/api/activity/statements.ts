import { z } from 'zod'
import { getActivityStatements, installPgStatStatements, resetActivityStatements } from '@/lib/db'
import { getRequestConnectionName } from '@/lib/api/connection'
import { parseWithSchema } from '@/lib/api/validation'
import { defineRoute } from '@/server/route'

const orderSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined),
  z.enum(['total', 'mean', 'calls']).optional()
)

const postBodySchema = z.object({
  action: z.enum(['install', 'reset']),
})

export default defineRoute({
  async GET(req) {
    const connectionName = getRequestConnectionName(req)
    const orderBy = parseWithSchema(orderSchema, req.query.orderBy)
    const result = await getActivityStatements(connectionName, { orderBy })
    return { ...result, fetchedAt: new Date().toISOString() }
  },

  async POST(req) {
    const connectionName = getRequestConnectionName(req)
    const { action } = parseWithSchema(postBodySchema, req.body || {})
    if (action === 'install') {
      await installPgStatStatements(connectionName)
    } else {
      await resetActivityStatements(connectionName)
    }
    return { ok: true }
  },
})
