import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { getTableDdl } from '../../../../lib/db'
import { getRequestConnectionName } from '../../../../lib/api/connection'
import {
  nonEmptyStringSchema,
  optionalSchemaNameSchema,
  parseWithSchema,
} from '../../../../lib/api/validation'
import { methodNotAllowed, sendApiError } from '../../../../lib/api/errors'

const tableParamSchema = z.object({
  table: nonEmptyStringSchema,
})

const ddlQuerySchema = z.object({
  schema: optionalSchemaNameSchema.default('public'),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET'])
  }

  try {
    const { table } = parseWithSchema(tableParamSchema, req.query)
    const { schema } = parseWithSchema(ddlQuerySchema, req.query)
    const connectionName = getRequestConnectionName(req)
    const ddl = await getTableDdl(connectionName, schema, table)
    return res.status(200).json({ ddl })
  } catch (error) {
    return sendApiError(res, error)
  }
}
