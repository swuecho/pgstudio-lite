import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { controlBackend } from '@/lib/db'
import { getRequestConnectionName } from '@/lib/api/connection'
import { parseWithSchema } from '@/lib/api/validation'
import { methodNotAllowed, sendApiError } from '@/lib/api/errors'

const bodySchema = z.object({
  pid: z.number().int().positive(),
  action: z.enum(['cancel', 'terminate']),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    const { pid, action } = parseWithSchema(bodySchema, req.body || {})
    const connectionName = getRequestConnectionName(req)
    const success = await controlBackend(connectionName, pid, action)
    return res.status(200).json({ ok: true, success })
  } catch (error) {
    return sendApiError(res, error)
  }
}
