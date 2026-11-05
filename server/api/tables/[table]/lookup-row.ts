import { z } from 'zod'
import { lookupTableRow } from '@/lib/db'
import { getRequestConnectionName } from '@/lib/api/connection'
import { nonEmptyStringSchema, optionalSchemaNameSchema, parseWithSchema } from '@/lib/api/validation'
import { defineRoute } from '@/server/route'

const tableParamSchema = z.object({
  table: nonEmptyStringSchema,
})

const lookupRowBodySchema = z.object({
  schema: optionalSchemaNameSchema.default('public'),
  match: z
    .record(z.string(), z.unknown())
    .refine((value) => Object.keys(value).length > 0, 'match must include at least one column'),
})

export default defineRoute({
  POST(req) {
    const { table } = parseWithSchema(tableParamSchema, req.query)
    const connectionName = getRequestConnectionName(req)
    const { schema, match } = parseWithSchema(lookupRowBodySchema, req.body)
    return lookupTableRow(connectionName, schema, table, match)
  },
})
