import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { createNotebook, deleteNotebook, listNotebooks, updateNotebook } from '../../../lib/notebook-db'
import { methodNotAllowed, sendApiError } from '../../../lib/api/errors'
import {
  nonEmptyStringSchema,
  optionalConnectionNameSchema,
  parseWithSchema,
} from '../../../lib/api/validation'

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

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const { limit } = parseWithSchema(notebooksQuerySchema, req.query)
      return res.status(200).json({ items: listNotebooks(limit) })
    }

    if (req.method === 'POST') {
      const { title, connectionName } = parseWithSchema(createNotebookSchema, req.body || {})
      const item = createNotebook({ title, connectionName })
      return res.status(200).json({ item })
    }

    if (req.method === 'PATCH') {
      const { id, title, connectionName } = parseWithSchema(updateNotebookSchema, req.body || {})
      const item = updateNotebook(id, { title, connectionName })
      if (!item) return res.status(404).json({ error: 'notebook not found' })
      return res.status(200).json({ item })
    }

    if (req.method === 'DELETE') {
      const { id } = parseWithSchema(deleteNotebookSchema, req.body || {})
      const ok = deleteNotebook(id)
      if (!ok) return res.status(404).json({ error: 'notebook not found' })
      return res.status(200).json({ ok: true })
    }
  } catch (error) {
    return sendApiError(res, error)
  }

  return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE'])
}
