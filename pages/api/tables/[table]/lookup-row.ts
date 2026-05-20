import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { lookupTableRow } from '../../../../lib/db'
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

const lookupRowBodySchema = z.object({
  schema: optionalSchemaNameSchema.default('public'),
  match: z
    .record(z.string(), z.unknown())
    .refine((value) => Object.keys(value).length > 0, 'match must include at least one column'),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  try {
    const { table } = parseWithSchema(tableParamSchema, req.query)
    const connectionName = getRequestConnectionName(req)
    const { schema, match } = parseWithSchema(lookupRowBodySchema, req.body)
    const result = await lookupTableRow(connectionName, schema, table, match)
    return res.status(200).json(result)
  } catch (error) {
    return sendApiError(res, error)
  }
}
