import { z } from 'zod'
import { clearHistory, getHistory } from '@/lib/db'
import { getRequestConnectionName } from '@/lib/api/connection'
import { parseWithSchema } from '@/lib/api/validation'
import { defineRoute } from '@/server/route'

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
})

export default defineRoute({
  GET(req) {
    const { limit } = parseWithSchema(historyQuerySchema, req.query)
    return { items: getHistory(limit, getRequestConnectionName(req)) }
  },

  DELETE(req) {
    clearHistory(getRequestConnectionName(req))
    return { ok: true }
  },
})
