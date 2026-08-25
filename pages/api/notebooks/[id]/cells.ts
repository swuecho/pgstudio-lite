import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import {
  createNotebookCell,
  deleteNotebookCell,
  getNotebookById,
  updateNotebookCell,
} from '@/lib/notebook-db'
import { methodNotAllowed, sendApiError } from '@/lib/api/errors'
import { nonEmptyStringSchema, parseWithSchema } from '@/lib/api/validation'
import { notebookWidgetMetadataSchema } from '@/lib/notebook-widgets'

const paramsSchema = z.object({ id: nonEmptyStringSchema })

const createCellSchema = z.object({
  type: z.enum(['sql', 'markdown', 'widget']),
  content: z.string().optional(),
  metadata: notebookWidgetMetadataSchema.nullable().optional(),
  position: z.coerce.number().int().min(0).optional(),
})

const patchCellSchema = z
  .object({
    cellId: nonEmptyStringSchema,
    type: z.enum(['sql', 'markdown', 'widget']).optional(),
    content: z.string().optional(),
    metadata: notebookWidgetMetadataSchema.nullable().optional(),
    collapsed: z.boolean().optional(),
    position: z.coerce.number().int().min(0).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.type === undefined &&
      value.content === undefined &&
      value.metadata === undefined &&
      value.collapsed === undefined &&
      value.position === undefined
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'at least one field is required' })
    }
  })

const deleteCellSchema = z.object({
  cellId: nonEmptyStringSchema,
})

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = parseWithSchema(paramsSchema, req.query)

    if (req.method === 'POST') {
      const payload = parseWithSchema(createCellSchema, req.body || {})
      const item = createNotebookCell({ notebookId: id, ...payload })
      const data = getNotebookById(id)
      return res.status(200).json({ item, cells: data?.cells || [] })
    }

    if (req.method === 'PATCH') {
      const { cellId, type, content, metadata, collapsed, position } = parseWithSchema(
        patchCellSchema,
        req.body || {}
      )
      const item = updateNotebookCell(id, cellId, { type, content, metadata, collapsed, position })
      if (!item) return res.status(404).json({ error: 'cell not found' })
      const data = getNotebookById(id)
      return res.status(200).json({ item, cells: data?.cells || [] })
    }

    if (req.method === 'DELETE') {
      const { cellId } = parseWithSchema(deleteCellSchema, req.body || {})
      const ok = deleteNotebookCell(id, cellId)
      if (!ok) return res.status(404).json({ error: 'cell not found' })
      const data = getNotebookById(id)
      return res.status(200).json({ ok: true, cells: data?.cells || [] })
    }
  } catch (error) {
    return sendApiError(res, error)
  }

  return methodNotAllowed(res, ['POST', 'PATCH', 'DELETE'])
}
