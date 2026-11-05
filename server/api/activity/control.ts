import { z } from 'zod'
import { controlBackend } from '@/lib/db'
import { getRequestConnectionName } from '@/lib/api/connection'
import { parseWithSchema } from '@/lib/api/validation'
import { defineRoute } from '@/server/route'

const bodySchema = z.object({
  pid: z.number().int().positive(),
  action: z.enum(['cancel', 'terminate']),
})

export default defineRoute({
  async POST(req) {
    const { pid, action } = parseWithSchema(bodySchema, req.body || {})
    const connectionName = getRequestConnectionName(req)
    const success = await controlBackend(connectionName, pid, action)
    return { ok: true, success }
  },
})
