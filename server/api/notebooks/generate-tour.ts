import { z } from 'zod'
import { importNotebookSpecV1 } from '@/lib/notebook-db'
import { generateTourNotebook } from '@/lib/tour-generator'
import { getRequestConnectionName } from '@/lib/api/connection'
import { errorResponse } from '@/lib/api/errors'
import { parseWithSchema } from '@/lib/api/validation'
import { defineRoute } from '@/server/route'

const bodySchema = z.object({
  schema: z.string().trim().min(1).optional(),
  maxTables: z.number().int().min(1).max(200).optional(),
})

export default defineRoute({
  async POST(req) {
    const { schema, maxTables } = parseWithSchema(bodySchema, req.body || {})
    const connectionName = getRequestConnectionName(req)
    const notebook = await generateTourNotebook({ connectionName, schema, maxTables })
    if (notebook.cells.length <= 1) {
      return errorResponse(404, { error: 'No tables found to tour', code: 'NO_TABLES' })
    }
    const result = importNotebookSpecV1({ mode: 'create', notebook })
    return {
      ok: true,
      notebook_id: result.notebook_id,
      cell_count: notebook.cells.length,
    }
  },
})
