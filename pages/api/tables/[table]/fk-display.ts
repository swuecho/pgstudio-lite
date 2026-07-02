import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import {
  getForeignKeyDisplayConfig,
  getTableColumns,
  saveForeignKeyDisplayConfig,
} from '../../../../lib/db'
import { getRequestConnectionName } from '../../../../lib/api/connection'
import {
  nonEmptyStringSchema,
  optionalSchemaNameSchema,
  parseWithSchema,
} from '../../../../lib/api/validation'
import { badRequest, methodNotAllowed, sendApiError } from '../../../../lib/api/errors'

const tableParamSchema = z.object({
  table: nonEmptyStringSchema,
})

const querySchema = z.object({
  schema: optionalSchemaNameSchema.default('public'),
})

const saveSchema = z.object({
  schema: optionalSchemaNameSchema.default('public'),
  displayColumns: z.array(nonEmptyStringSchema).min(1).max(5),
  displayTemplate: z.string().trim().optional().nullable(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return methodNotAllowed(res, ['GET', 'PATCH'])
  }

  try {
    const { table } = parseWithSchema(tableParamSchema, req.query)
    const connectionName = getRequestConnectionName(req)

    if (req.method === 'GET') {
      const { schema } = parseWithSchema(querySchema, req.query)
      const config = getForeignKeyDisplayConfig({ connectionName, schema, table })
      return res.status(200).json({ config })
    }

    const { schema, displayColumns, displayTemplate } = parseWithSchema(saveSchema, req.body || {})
    const columns = await getTableColumns(connectionName, table, schema)
    const columnNames = new Set(columns.map((column) => column.name))
    const invalidColumn = displayColumns.find((column) => !columnNames.has(column))
    if (invalidColumn) {
      throw badRequest(`unknown display column '${invalidColumn}'`, 'INVALID_DISPLAY_COLUMN')
    }

    const config = saveForeignKeyDisplayConfig({
      connectionName,
      schema,
      table,
      displayColumns,
      displayTemplate: displayTemplate ?? null,
    })
    return res.status(200).json({ config })
  } catch (error) {
    return sendApiError(res, error)
  }
}
