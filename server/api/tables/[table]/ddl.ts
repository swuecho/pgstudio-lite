import { z } from 'zod'
import { getTableDdl } from '@/lib/db'
import { getRequestConnectionName } from '@/lib/api/connection'
import { nonEmptyStringSchema, optionalSchemaNameSchema, parseWithSchema } from '@/lib/api/validation'
import { defineRoute } from '@/server/route'

const tableParamSchema = z.object({
  table: nonEmptyStringSchema,
})

const ddlQuerySchema = z.object({
  schema: optionalSchemaNameSchema.default('public'),
})

export default defineRoute({
  async GET(req) {
    const { table } = parseWithSchema(tableParamSchema, req.query)
    const { schema } = parseWithSchema(ddlQuerySchema, req.query)
    const connectionName = getRequestConnectionName(req)
    const ddl = await getTableDdl(connectionName, schema, table)
    return { ddl }
  },
})
