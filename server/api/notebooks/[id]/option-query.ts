import { z } from 'zod'
import { runNotebookOptionQuery } from '@/lib/notebook-db'
import { nonEmptyStringSchema, parseWithSchema } from '@/lib/api/validation'
import { defineRoute } from '@/server/route'

const paramsSchema = z.object({ id: nonEmptyStringSchema })
const optionQueryBodySchema = z.object({
  query: z.string().trim().min(1, 'query is required'),
  inputValues: z.record(z.string(), z.unknown()).optional(),
})

export default defineRoute({
  POST(req) {
    const { id } = parseWithSchema(paramsSchema, req.query)
    const { query, inputValues } = parseWithSchema(optionQueryBodySchema, req.body || {})
    return runNotebookOptionQuery({ notebookId: id, query, inputValues })
  },
})
