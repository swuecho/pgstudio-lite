import { z } from 'zod'
import { exportNotebookSpecV1ById } from '@/lib/notebook-db'
import { nonEmptyStringSchema, parseWithSchema } from '@/lib/api/validation'
import { defineRoute } from '@/server/route'

const paramsSchema = z.object({
  id: nonEmptyStringSchema,
})

export default defineRoute({
  GET(req) {
    const { id } = parseWithSchema(paramsSchema, req.query)
    return exportNotebookSpecV1ById(id)
  },
})
