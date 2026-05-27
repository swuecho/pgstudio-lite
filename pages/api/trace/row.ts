import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { traceRowLineage } from '../../../lib/row-trace'
import { getRequestConnectionName } from '../../../lib/api/connection'
import { parseWithSchema } from '../../../lib/api/validation'
import { methodNotAllowed, sendApiError } from '../../../lib/api/errors'

const bodySchema = z.object({
  schema: z.string().trim().min(1),
  table: z.string().trim().min(1),
  pk: z.record(z.string(), z.unknown()),
  maxDepth: z.number().int().min(1).max(6).optional(),
  childLimit: z.number().int().min(1).max(20).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    const { schema, table, pk, maxDepth, childLimit } = parseWithSchema(bodySchema, req.body || {})
    const connectionName = getRequestConnectionName(req)
    const tree = await traceRowLineage({ connectionName, schema, table, pk, maxDepth, childLimit })
    return res.status(200).json({ ok: true, tree })
  } catch (error) {
    return sendApiError(res, error)
  }
}
