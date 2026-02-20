import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { deleteSnippet, getSnippets, saveSnippet, updateSnippet } from '../../lib/db'
import { nonEmptyStringSchema, parseWithSchema } from './_utils/validation'

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
    if (req.method === 'GET') {
      const { limit } = parseWithSchema(snippetsQuerySchema, req.query)
      return res.status(200).json({ items: getSnippets(limit) })
    }

    if (req.method === 'POST') {
      const { title, queryText } = parseWithSchema(createSnippetSchema, req.body || {})
      const item = saveSnippet({ title, queryText })
      return res.status(200).json({ item })
    }

    if (req.method === 'DELETE') {
      const { id } = parseWithSchema(deleteSnippetSchema, req.body || {})
      deleteSnippet(id)
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'PATCH') {
      const { id, title, queryText } = parseWithSchema(updateSnippetSchema, req.body || {})
      const item = updateSnippet({ id, title, queryText })
      if (!item) return res.status(404).json({ error: 'snippet not found' })
      return res.status(200).json({ item })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const statusCode = (error as { statusCode?: number })?.statusCode || 400
    return res.status(statusCode).json({ error: message })
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}
