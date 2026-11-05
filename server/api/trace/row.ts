import { z } from 'zod'
import { traceRowLineage } from '@/lib/row-trace'
import { getRequestConnectionName } from '@/lib/api/connection'
import { parseWithSchema } from '@/lib/api/validation'
import { defineRoute } from '@/server/route'

const bodySchema = z.object({
  schema: z.string().trim().min(1),
  table: z.string().trim().min(1),
  pk: z.record(z.string(), z.unknown()),
  maxDepth: z.number().int().min(1).max(6).optional(),
  childLimit: z.number().int().min(1).max(20).optional(),
})

export default defineRoute({
  async POST(req) {
    const { schema, table, pk, maxDepth, childLimit } = parseWithSchema(bodySchema, req.body || {})
    const connectionName = getRequestConnectionName(req)
    const tree = await traceRowLineage({ connectionName, schema, table, pk, maxDepth, childLimit })
    return { ok: true, tree }
  },
})
