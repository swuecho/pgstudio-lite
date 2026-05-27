import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { importNotebookSpecV1 } from '../../../lib/notebook-db'
import { generateTourNotebook } from '../../../lib/tour-generator'
import { getRequestConnectionName } from '../../../lib/api/connection'
import { parseWithSchema } from '../../../lib/api/validation'
import { methodNotAllowed, sendApiError } from '../../../lib/api/errors'

const bodySchema = z.object({
  schema: z.string().trim().min(1).optional(),
  maxTables: z.number().int().min(1).max(200).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    const { schema, maxTables } = parseWithSchema(bodySchema, req.body || {})
    const connectionName = getRequestConnectionName(req)
    const notebook = await generateTourNotebook({ connectionName, schema, maxTables })
    if (notebook.cells.length <= 1) {
      return res.status(404).json({
        error: 'No tables found to tour',
        code: 'NO_TABLES',
      })
    }
    const result = importNotebookSpecV1({ mode: 'create', notebook })
    return res.status(200).json({
      ok: true,
      notebook_id: result.notebook_id,
      cell_count: notebook.cells.length,
    })
  } catch (error) {
    return sendApiError(res, error)
  }
}
