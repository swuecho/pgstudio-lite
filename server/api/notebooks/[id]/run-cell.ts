import { z } from 'zod'
import { runNotebookSqlCell } from '@/lib/notebook-db'
import { nonEmptyStringSchema, parseWithSchema } from '@/lib/api/validation'
import { defineRoute } from '@/server/route'

const paramsSchema = z.object({ id: nonEmptyStringSchema })
const runCellBodySchema = z.object({
  cellId: nonEmptyStringSchema,
  query: z.string().trim().min(1, 'query is required'),
  inputValues: z.record(z.string(), z.unknown()).optional(),
})

export default defineRoute({
  POST(req) {
    const { id } = parseWithSchema(paramsSchema, req.query)
    const { cellId, query, inputValues } = parseWithSchema(runCellBodySchema, req.body || {})
    return runNotebookSqlCell({ notebookId: id, cellId, query, inputValues })
  },
})
