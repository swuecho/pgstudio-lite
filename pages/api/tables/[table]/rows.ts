import type { NextApiRequest, NextApiResponse } from 'next'
import {
  deleteTableRowByCtid,
  getTableColumns,
  getTableRows,
  insertTableRow,
  updateTableRowByCtid,
} from '../../../../lib/db'

function getConnectionName(req: NextApiRequest) {
  if (typeof req.query.connectionName === 'string') return req.query.connectionName
  if (typeof req.body?.connectionName === 'string') return req.body.connectionName
  return 'default'
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const table = typeof req.query.table === 'string' ? req.query.table : ''
  if (!table) return res.status(400).json({ error: 'table is required' })

  const connectionName = getConnectionName(req)

  try {
    if (req.method === 'GET') {
      const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)))
      const offset = Math.max(0, Number(req.query.offset || 0))
      const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : undefined
      const sortOrder =
        req.query.sortOrder === 'desc' || req.query.sortOrder === 'asc'
          ? req.query.sortOrder
          : undefined
      const filterColumn = typeof req.query.filterColumn === 'string' ? req.query.filterColumn : undefined
      const filterValue = typeof req.query.filterValue === 'string' ? req.query.filterValue : undefined
      const filterMode =
        req.query.filterMode === 'equals' || req.query.filterMode === 'contains'
          ? req.query.filterMode
          : undefined
      const [columns, rows] = await Promise.all([
        getTableColumns(connectionName, table),
        getTableRows(connectionName, table, {
          limit,
          offset,
          sortBy,
          sortOrder,
          filterColumn,
          filterValue,
          filterMode,
        }),
      ])
      return res.status(200).json({ table, columns, rows: rows.rows, total: rows.total })
    }

    if (req.method === 'POST') {
      const payload = (req.body?.row || {}) as Record<string, unknown>
      await insertTableRow(connectionName, table, payload)
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'PATCH') {
      const ctid = typeof req.body?.ctid === 'string' ? req.body.ctid : ''
      const patch = (req.body?.patch || {}) as Record<string, unknown>
      if (!ctid) return res.status(400).json({ error: 'ctid is required for update' })
      await updateTableRowByCtid(connectionName, table, ctid, patch)
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'DELETE') {
      const ctid = typeof req.body?.ctid === 'string' ? req.body.ctid : ''
      if (!ctid) return res.status(400).json({ error: 'ctid is required for delete' })
      await deleteTableRowByCtid(connectionName, table, ctid)
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
