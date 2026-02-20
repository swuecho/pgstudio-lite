import type { NextApiRequest, NextApiResponse } from 'next'
import { getTableColumns } from '../../../lib/db'
import { getRequestConnectionName } from '../_utils/connection'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const connectionName = getRequestConnectionName(req)
  const schema = typeof req.query.schema === 'string' ? req.query.schema : 'public'
  const table = typeof req.query.table === 'string' ? req.query.table : ''

  if (!table) return res.status(400).json({ error: 'table is required' })

  try {
    const columns = await getTableColumns(connectionName, table, schema)
    return res.status(200).json({ columns })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const statusCode = (error as { statusCode?: number })?.statusCode || 400
    return res.status(statusCode).json({ error: message })
  }
}
