import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import {
  clearTableEditorRecentViews,
  deleteTableEditorBookmark,
  getTableEditorViews,
  importTableEditorViewsFromLocalStorage,
  recordTableEditorRecentView,
  saveTableEditorBookmark,
  updateTableEditorBookmark,
} from '../../lib/db'
import { getRequestConnectionName } from '../../lib/api/connection'
import { nonEmptyStringSchema, parseWithSchema } from '../../lib/api/validation'
import { methodNotAllowed, sendApiError } from '../../lib/api/errors'
import { getColumnKind } from '../../lib/table-column-kind'
import { parseFilterMode } from '../../lib/table-filter'
import type { TableEditorFilter } from '../../components/table-editor/stores/tableEditorFilterStore'

const tableFilterSchema = z
  .object({
    filterColumn: nonEmptyStringSchema,
    filterMode: nonEmptyStringSchema,
    filterValue: z.string(),
    filterValueEnd: z.string(),
  })
  .optional()

const createBookmarkSchema = z.object({
  title: nonEmptyStringSchema,
  activeTable: nonEmptyStringSchema,
  filter: tableFilterSchema,
})

const updateBookmarkSchema = z
  .object({
    id: nonEmptyStringSchema,
    title: nonEmptyStringSchema.optional(),
    pinned: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.title === undefined && value.pinned === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'title or pinned is required',
      })
    }
  })

const deleteBookmarkSchema = z.object({
  id: nonEmptyStringSchema,
})

const recordRecentSchema = z.object({
  activeTable: nonEmptyStringSchema,
  filter: tableFilterSchema,
})

const importViewsSchema = z.object({
  bookmarksByConnection: z.record(z.string(), z.array(z.any())),
  recentViewsByConnection: z.record(z.string(), z.array(z.any())),
})

function parseApiFilter(filter: z.infer<typeof tableFilterSchema>): TableEditorFilter | undefined {
  if (!filter) return undefined
  return {
    filterColumn: filter.filterColumn,
    filterMode: parseFilterMode(filter.filterMode, getColumnKind('text')),
    filterValue: filter.filterValue,
    filterValueEnd: filter.filterValueEnd,
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const connectionName = getRequestConnectionName(req)

    if (req.method === 'GET') {
      return res.status(200).json(getTableEditorViews(connectionName))
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      if (body.action === 'import') {
        const payload = parseWithSchema(importViewsSchema, body)
        importTableEditorViewsFromLocalStorage(payload)
        return res.status(200).json({ ok: true })
      }

      if (body.action === 'recordRecent') {
        const { activeTable, filter } = parseWithSchema(recordRecentSchema, body)
        const item = recordTableEditorRecentView({
          connectionName,
          activeTable,
          filter: parseApiFilter(filter),
        })
        return res.status(200).json({ item })
      }

      const { title, activeTable, filter } = parseWithSchema(createBookmarkSchema, body)
      const item = saveTableEditorBookmark(
        { connectionName, activeTable, filter: parseApiFilter(filter) },
        title
      )
      if (!item) return res.status(400).json({ error: 'failed to save bookmark' })
      return res.status(200).json({ item })
    }

    if (req.method === 'PATCH') {
      const { id, title, pinned } = parseWithSchema(updateBookmarkSchema, req.body || {})
      const item = updateTableEditorBookmark({ id, connectionName, title, pinned })
      if (!item) return res.status(404).json({ error: 'bookmark not found' })
      return res.status(200).json({ item })
    }

    if (req.method === 'DELETE') {
      const body = req.body || {}
      if (body.action === 'clearRecent') {
        clearTableEditorRecentViews(connectionName)
        return res.status(200).json({ ok: true })
      }

      const { id } = parseWithSchema(deleteBookmarkSchema, body)
      deleteTableEditorBookmark(id, connectionName)
      return res.status(200).json({ ok: true })
    }
  } catch (error) {
    return sendApiError(res, error)
  }

  return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE'])
}
