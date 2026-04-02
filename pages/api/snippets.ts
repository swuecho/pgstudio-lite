import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { deleteSnippet, getSnippets, saveSnippet, updateSnippet } from '../../lib/db'
import { getRequestConnectionName } from '../../lib/api/connection'
import { nonEmptyStringSchema, parseWithSchema } from '../../lib/api/validation'
import { methodNotAllowed, sendApiError } from '../../lib/api/errors'

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

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const connectionName = getRequestConnectionName(req)

    if (req.method === 'GET') {
      const { limit } = parseWithSchema(snippetsQuerySchema, req.query)
      return res.status(200).json({ items: getSnippets(limit, connectionName) })
    }

    if (req.method === 'POST') {
      const { title, queryText } = parseWithSchema(createSnippetSchema, req.body || {})
      const item = saveSnippet({ title, queryText, connectionName })
      return res.status(200).json({ item })
    }

    if (req.method === 'DELETE') {
      const { id } = parseWithSchema(deleteSnippetSchema, req.body || {})
      deleteSnippet(id, connectionName)
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'PATCH') {
      const { id, title, queryText } = parseWithSchema(updateSnippetSchema, req.body || {})
      const item = updateSnippet({ id, title, queryText, connectionName })
      if (!item) return res.status(404).json({ error: 'snippet not found' })
      return res.status(200).json({ item })
    }
  } catch (error) {
    return sendApiError(res, error)
  }

  return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE'])
}
