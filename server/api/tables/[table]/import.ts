import { z } from 'zod'
import { importTableRows } from '@/lib/db'
import { getRequestConnectionName } from '@/lib/api/connection'
import { nonEmptyStringSchema, optionalSchemaNameSchema, parseWithSchema } from '@/lib/api/validation'
import { defineRoute } from '@/server/route'

const MAX_IMPORT_ROWS = 50_000

const tableParamSchema = z.object({
  table: nonEmptyStringSchema,
})

const importBodySchema = z.object({
  schema: optionalSchemaNameSchema.default('public'),
  columns: z.array(nonEmptyStringSchema).min(1, 'select at least one column to import'),
  rows: z
    .array(z.array(z.unknown()))
    .max(MAX_IMPORT_ROWS, `imports are limited to ${MAX_IMPORT_ROWS} rows at a time`),
})

export default defineRoute({
  POST(req) {
    const { table } = parseWithSchema(tableParamSchema, req.query)
    const connectionName = getRequestConnectionName(req)
    const { schema, columns, rows } = parseWithSchema(importBodySchema, req.body || {})
    return importTableRows(connectionName, schema, table, columns, rows)
  },
})
