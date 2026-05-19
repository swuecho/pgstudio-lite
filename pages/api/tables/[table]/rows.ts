import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import {
  deleteTableRowByPrimaryKey,
  getTableColumns,
  getTableRows,
  insertTableRow,
  updateTableRowByPrimaryKey,
} from '../../../../lib/db'
import { TABLE_FILTER_MODES } from '../../../../lib/table-filter'
import { getRequestConnectionName } from '../../../../lib/api/connection'
import { nonEmptyStringSchema, optionalSchemaNameSchema, parseWithSchema } from '../../../../lib/api/validation'
import { methodNotAllowed, sendApiError } from '../../../../lib/api/errors'

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
  filterValueEnd: z.string().trim().optional(),
  filterMode: z.enum(TABLE_FILTER_MODES).optional(),
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

const insertRowBodySchema = z.object({
  schema: optionalSchemaNameSchema.default('public'),
  values: z
    .record(z.string(), z.unknown())
    .refine((value) => Object.keys(value).length > 0, 'values must include at least one column'),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { table } = parseWithSchema(tableParamSchema, req.query)
    const connectionName = getRequestConnectionName(req)

    if (req.method === 'GET') {
      const { schema, limit, offset, sortBy, sortOrder, filterColumn, filterValue, filterValueEnd, filterMode } =
        parseWithSchema(rowsQuerySchema, req.query)
      const columns = await getTableColumns(connectionName, table, schema)
      const rows = await getTableRows(connectionName, schema, table, {
        limit,
        offset,
        sortBy,
        sortOrder,
        filterColumn,
        filterValue,
        filterValueEnd,
        filterMode,
        columns: columns.map((column) => ({ name: column.name, dataType: column.dataType })),
      })
      return res.status(200).json({ schema, table, columns, rows: rows.rows, total: rows.total })
    }

    if (req.method === 'POST') {
      const { schema, values } = parseWithSchema(insertRowBodySchema, req.body || {})
      const row = await insertTableRow(connectionName, schema, table, values)
      return res.status(200).json({ row })
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

    return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE'])
  } catch (error) {
    return sendApiError(res, error)
  }
}
