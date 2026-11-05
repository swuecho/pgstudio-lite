import { z } from 'zod'
import { deleteSnippet, getSnippets, saveSnippet, updateSnippet } from '@/lib/db'
import { getRequestConnectionName } from '@/lib/api/connection'
import { nonEmptyStringSchema, parseWithSchema } from '@/lib/api/validation'
import { errorResponse } from '@/lib/api/errors'
import { defineRoute } from '@/server/route'

const snippetsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
})

const createSnippetSchema = z.object({
  title: nonEmptyStringSchema,
  queryText: nonEmptyStringSchema,
})

const deleteSnippetSchema = z.object({
  id: nonEmptyStringSchema,
})

const updateSnippetSchema = z
  .object({
    id: nonEmptyStringSchema,
    title: nonEmptyStringSchema.optional(),
    queryText: nonEmptyStringSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.title === undefined && value.queryText === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'title or queryText is required',
      })
    }
  })

export default defineRoute({
  GET(req) {
    const { limit } = parseWithSchema(snippetsQuerySchema, req.query)
    return { items: getSnippets(limit, getRequestConnectionName(req)) }
  },

  POST(req) {
    const connectionName = getRequestConnectionName(req)
    const { title, queryText } = parseWithSchema(createSnippetSchema, req.body || {})
    const item = saveSnippet({ title, queryText, connectionName })
    return { item }
  },

  DELETE(req) {
    const connectionName = getRequestConnectionName(req)
    const { id } = parseWithSchema(deleteSnippetSchema, req.body || {})
    deleteSnippet(id, connectionName)
    return { ok: true }
  },

  PATCH(req) {
    const connectionName = getRequestConnectionName(req)
    const { id, title, queryText } = parseWithSchema(updateSnippetSchema, req.body || {})
    const item = updateSnippet({ id, title, queryText, connectionName })
    if (!item) return errorResponse(404, { error: 'snippet not found' })
    return { item }
  },
})
