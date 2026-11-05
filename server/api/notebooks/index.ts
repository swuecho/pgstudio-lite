import { z } from 'zod'
import { createNotebook, deleteNotebook, listNotebooks, updateNotebook } from '@/lib/notebook-db'
import { errorResponse } from '@/lib/api/errors'
import { nonEmptyStringSchema, optionalConnectionNameSchema, parseWithSchema } from '@/lib/api/validation'
import { defineRoute } from '@/server/route'

const notebooksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
})

const createNotebookSchema = z.object({
  title: nonEmptyStringSchema,
  connectionName: optionalConnectionNameSchema.optional(),
})

const updateNotebookSchema = z
  .object({
    id: nonEmptyStringSchema,
    title: nonEmptyStringSchema.optional(),
    connectionName: optionalConnectionNameSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.title === undefined && value.connectionName === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'title or connectionName is required' })
    }
  })

const deleteNotebookSchema = z.object({
  id: nonEmptyStringSchema,
})

export default defineRoute({
  GET(req) {
    const { limit } = parseWithSchema(notebooksQuerySchema, req.query)
    return { items: listNotebooks(limit) }
  },

  POST(req) {
    const { title, connectionName } = parseWithSchema(createNotebookSchema, req.body || {})
    const item = createNotebook({ title, connectionName })
    return { item }
  },

  PATCH(req) {
    const { id, title, connectionName } = parseWithSchema(updateNotebookSchema, req.body || {})
    const item = updateNotebook(id, { title, connectionName })
    if (!item) return errorResponse(404, { error: 'notebook not found' })
    return { item }
  },

  DELETE(req) {
    const { id } = parseWithSchema(deleteNotebookSchema, req.body || {})
    if (!deleteNotebook(id)) return errorResponse(404, { error: 'notebook not found' })
    return { ok: true }
  },
})
