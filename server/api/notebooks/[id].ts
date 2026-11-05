import { z } from 'zod'
import { getNotebookById } from '@/lib/notebook-db'
import { errorResponse } from '@/lib/api/errors'
import { nonEmptyStringSchema, parseWithSchema } from '@/lib/api/validation'
import { defineRoute } from '@/server/route'

const paramsSchema = z.object({
  id: nonEmptyStringSchema,
})

export default defineRoute({
  GET(req) {
    const { id } = parseWithSchema(paramsSchema, req.query)
    const data = getNotebookById(id)
    if (!data) return errorResponse(404, { error: 'notebook not found' })
    return data
  },
})
