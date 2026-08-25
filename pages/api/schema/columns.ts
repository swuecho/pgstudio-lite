import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { getTableColumns } from '@/lib/db'
import { getRequestConnectionName } from '@/lib/api/connection'
import { parseWithSchema } from '@/lib/api/validation'
import { methodNotAllowed, sendApiError } from '@/lib/api/errors'

const schemaColumnsQuerySchema = z.object({
  schema: z.string().trim().optional().default('public'),
  table: z.string().trim().min(1, 'table is required'),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET'])
  }

  try {
    const connectionName = getRequestConnectionName(req)
    const { schema, table } = parseWithSchema(schemaColumnsQuerySchema, req.query)
    const columns = await getTableColumns(connectionName, table, schema)
    return res.status(200).json({ columns })
  } catch (error) {
    return sendApiError(res, error)
  }
}
