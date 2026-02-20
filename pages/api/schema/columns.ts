import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { getTableColumns } from '../../../lib/db'
import { getRequestConnectionName } from '../../../lib/api/connection'
import { parseWithSchema } from '../../../lib/api/validation'

const schemaColumnsQuerySchema = z.object({
  schema: z.string().trim().optional().default('public'),
  table: z.string().trim().min(1, 'table is required'),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const connectionName = getRequestConnectionName(req)
    const { schema, table } = parseWithSchema(schemaColumnsQuerySchema, req.query)
    const columns = await getTableColumns(connectionName, table, schema)
    return res.status(200).json({ columns })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const statusCode = (error as { statusCode?: number })?.statusCode || 400
    return res.status(statusCode).json({ error: message })
  }
}
