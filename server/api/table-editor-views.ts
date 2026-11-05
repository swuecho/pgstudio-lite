import { z } from 'zod'
import {
  clearTableEditorRecentViews,
  deleteTableEditorBookmark,
  getTableEditorViews,
  importTableEditorViewsFromLocalStorage,
  recordTableEditorRecentView,
  saveTableEditorBookmark,
  updateTableEditorBookmark,
} from '@/lib/db'
import { getRequestConnectionName } from '@/lib/api/connection'
import { nonEmptyStringSchema, parseWithSchema } from '@/lib/api/validation'
import { errorResponse } from '@/lib/api/errors'
import { defineRoute } from '@/server/route'
import { getColumnKind } from '@/lib/table-column-kind'
import { parseFilterMode } from '@/lib/table-filter'
import type { TableEditorFilter } from '@/components/table-editor/stores/tableEditorFilterStore'

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

function bodyRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
}

export default defineRoute({
  GET(req) {
    return getTableEditorViews(getRequestConnectionName(req))
  },

  POST(req) {
    const connectionName = getRequestConnectionName(req)
    const body = bodyRecord(req.body)
    if (body.action === 'import') {
      const payload = parseWithSchema(importViewsSchema, body)
      importTableEditorViewsFromLocalStorage(payload)
      return { ok: true }
    }

    if (body.action === 'recordRecent') {
      const { activeTable, filter } = parseWithSchema(recordRecentSchema, body)
      const item = recordTableEditorRecentView({
        connectionName,
        activeTable,
        filter: parseApiFilter(filter),
      })
      return { item }
    }

    const { title, activeTable, filter } = parseWithSchema(createBookmarkSchema, body)
    const item = saveTableEditorBookmark(
      { connectionName, activeTable, filter: parseApiFilter(filter) },
      title
    )
    if (!item) return errorResponse(400, { error: 'failed to save bookmark' })
    return { item }
  },

  PATCH(req) {
    const connectionName = getRequestConnectionName(req)
    const { id, title, pinned } = parseWithSchema(updateBookmarkSchema, req.body || {})
    const item = updateTableEditorBookmark({ id, connectionName, title, pinned })
    if (!item) return errorResponse(404, { error: 'bookmark not found' })
    return { item }
  },

  DELETE(req) {
    const connectionName = getRequestConnectionName(req)
    const body = bodyRecord(req.body)
    if (body.action === 'clearRecent') {
      clearTableEditorRecentViews(connectionName)
      return { ok: true }
    }

    const { id } = parseWithSchema(deleteBookmarkSchema, body)
    deleteTableEditorBookmark(id, connectionName)
    return { ok: true }
  },
})
