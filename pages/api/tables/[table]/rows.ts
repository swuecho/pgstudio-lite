import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import {
  deleteTableRowByCtid,
  getTableColumns,
  getTableRows,
  insertTableRow,
  updateTableRowByCtid,
} from '../../../../lib/db'
import { getRequestConnectionName } from '../../../../lib/api/connection'
import { nonEmptyStringSchema, optionalSchemaNameSchema, parseWithSchema } from '../../../../lib/api/validation'

const tableParamSchema = z.object({
  table: nonEmptyStringSchema,
})

const rowsQuerySchema = z.object({
  schema: optionalSchemaNameSchema.default('public'),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sortBy: z.string().trim().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  filterColumn: z.string().trim().optional(),
  filterValue: z.string().trim().optional(),
  filterMode: z.enum(['contains', 'equals']).optional(),
})

const createRowBodySchema = z.object({
  schema: optionalSchemaNameSchema.default('public'),
  row: z.record(z.string(), z.unknown()).optional().default({}),
})

const patchRowBodySchema = z.object({
  schema: optionalSchemaNameSchema.default('public'),
  ctid: nonEmptyStringSchema,
  patch: z.record(z.string(), z.unknown()).optional().default({}),
})

const deleteRowBodySchema = z.object({
  schema: optionalSchemaNameSchema.default('public'),
  ctid: nonEmptyStringSchema,
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { table } = parseWithSchema(tableParamSchema, req.query)
    const connectionName = getRequestConnectionName(req)

    if (req.method === 'GET') {
      const { schema, limit, offset, sortBy, sortOrder, filterColumn, filterValue, filterMode } = parseWithSchema(
        rowsQuerySchema,
        req.query
      )
      const [columns, rows] = await Promise.all([
        getTableColumns(connectionName, table, schema),
        getTableRows(connectionName, schema, table, {
          limit,
          offset,
          sortBy,
          sortOrder,
          filterColumn,
          filterValue,
          filterMode,
        }),
      ])
      return res.status(200).json({ schema, table, columns, rows: rows.rows, total: rows.total })
    }

    if (req.method === 'POST') {
      const { schema, row: payload } = parseWithSchema(createRowBodySchema, req.body || {})
      await insertTableRow(connectionName, schema, table, payload)
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'PATCH') {
      const { schema, ctid, patch } = parseWithSchema(patchRowBodySchema, req.body || {})
      await updateTableRowByCtid(connectionName, schema, table, ctid, patch)
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'DELETE') {
      const { schema, ctid } = parseWithSchema(deleteRowBodySchema, req.body || {})
      await deleteTableRowByCtid(connectionName, schema, table, ctid)
      return res.status(200).json({ ok: true })
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const statusCode = (error as { statusCode?: number })?.statusCode || 400
    return res.status(statusCode).json({ error: message })
  }
}
