import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import {
  deleteTableRowByPrimaryKey,
  getTableColumns,
  getTableRows,
  updateTableRowByPrimaryKey,
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

const patchRowBodySchema = z.object({
  schema: optionalSchemaNameSchema.default('public'),
  rowKey: z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length > 0, 'rowKey is required'),
  patch: z.record(z.string(), z.unknown()).optional().default({}),
})

const deleteRowBodySchema = z.object({
  schema: optionalSchemaNameSchema.default('public'),
  rowKey: z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length > 0, 'rowKey is required'),
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

    if (req.method === 'PATCH') {
      const { schema, rowKey, patch } = parseWithSchema(patchRowBodySchema, req.body || {})
      await updateTableRowByPrimaryKey(connectionName, schema, table, rowKey, patch)
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'DELETE') {
      const { schema, rowKey } = parseWithSchema(deleteRowBodySchema, req.body || {})
      await deleteTableRowByPrimaryKey(connectionName, schema, table, rowKey)
      return res.status(200).json({ ok: true })
    }

    res.setHeader('Allow', 'GET, PATCH, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const statusCode = (error as { statusCode?: number })?.statusCode || 400
    return res.status(statusCode).json({ error: message })
  }
}
