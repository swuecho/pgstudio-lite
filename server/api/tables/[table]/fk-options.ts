import { z } from 'zod'
import { getForeignKeyOptions } from '@/lib/db'
import { getRequestConnectionName } from '@/lib/api/connection'
import { nonEmptyStringSchema, optionalSchemaNameSchema, parseWithSchema } from '@/lib/api/validation'
import { defineRoute } from '@/server/route'

const tableParamSchema = z.object({
  table: nonEmptyStringSchema,
})

const querySchema = z.object({
  schema: optionalSchemaNameSchema.default('public'),
  column: nonEmptyStringSchema,
  search: z.string().optional().default(''),
  selectedValue: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
})

export default defineRoute({
  GET(req) {
    const { table } = parseWithSchema(tableParamSchema, req.query)
    const connectionName = getRequestConnectionName(req)
    const { schema, column, search, selectedValue, limit } = parseWithSchema(querySchema, req.query)
    return getForeignKeyOptions(connectionName, schema, table, column, search, limit, selectedValue)
  },
})
