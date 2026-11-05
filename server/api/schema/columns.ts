import { z } from 'zod'
import { getTableColumns } from '@/lib/db'
import { getRequestConnectionName } from '@/lib/api/connection'
import { parseWithSchema } from '@/lib/api/validation'
import { defineRoute } from '@/server/route'

const schemaColumnsQuerySchema = z.object({
  schema: z.string().trim().optional().default('public'),
  table: z.string().trim().min(1, 'table is required'),
})

export default defineRoute({
  async GET(req) {
    const connectionName = getRequestConnectionName(req)
    const { schema, table } = parseWithSchema(schemaColumnsQuerySchema, req.query)
    const columns = await getTableColumns(connectionName, table, schema)
    return { columns }
  },
})
