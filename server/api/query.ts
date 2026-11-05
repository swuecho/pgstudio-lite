import { z } from 'zod'
import { executeQuery } from '@/lib/db'
import { getRequestConnectionName } from '@/lib/api/connection'
import { parseWithSchema } from '@/lib/api/validation'
import { defineRoute } from '@/server/route'

const queryBodySchema = z.object({
  query: z
    .string()
    .min(1, 'query is required')
    .refine((value) => Boolean(value.trim()), 'query is required'),
  rowLimit: z.number().int().min(1).max(500).optional(),
})

export default defineRoute({
  async POST(req) {
    const { query, rowLimit } = parseWithSchema(queryBodySchema, req.body || {})
    const connectionName = getRequestConnectionName(req)
    return executeQuery({
      query,
      connectionName,
      ...(rowLimit === undefined ? {} : { rowLimit }),
    })
  },
})
