import { z } from 'zod'
import {
  createNotebookCell,
  deleteNotebookCell,
  getNotebookById,
  updateNotebookCell,
} from '@/lib/notebook-db'
import { errorResponse } from '@/lib/api/errors'
import { nonEmptyStringSchema, parseWithSchema } from '@/lib/api/validation'
import { notebookWidgetMetadataSchema } from '@/lib/notebook-widgets'
import { defineRoute, type RouteContext } from '@/server/route'

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

function notebookId(req: RouteContext) {
  return parseWithSchema(paramsSchema, req.query).id
}

function cellsOf(id: string) {
  return getNotebookById(id)?.cells || []
}

export default defineRoute({
  POST(req) {
    const id = notebookId(req)
    const payload = parseWithSchema(createCellSchema, req.body || {})
    const item = createNotebookCell({ notebookId: id, ...payload })
    return { item, cells: cellsOf(id) }
  },

  PATCH(req) {
    const id = notebookId(req)
    const { cellId, type, content, metadata, collapsed, position } = parseWithSchema(
      patchCellSchema,
      req.body || {}
    )
    const item = updateNotebookCell(id, cellId, { type, content, metadata, collapsed, position })
    if (!item) return errorResponse(404, { error: 'cell not found' })
    return { item, cells: cellsOf(id) }
  },

  DELETE(req) {
    const id = notebookId(req)
    const { cellId } = parseWithSchema(deleteCellSchema, req.body || {})
    if (!deleteNotebookCell(id, cellId)) return errorResponse(404, { error: 'cell not found' })
    return { ok: true, cells: cellsOf(id) }
  },
})
