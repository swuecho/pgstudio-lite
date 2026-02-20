import type { NextApiRequest, NextApiResponse } from 'next'
import {
  createConnection,
  deleteConnection,
  getPublicConnections,
  setDefaultConnection,
  updateConnection,
} from '../../lib/db'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const connections = getPublicConnections()
      const defaultConnectionName = connections.find((connection) => connection.isDefault)?.name || null
      return res.status(200).json({
        connections,
        configured: connections.length > 0,
        defaultConnectionName,
      })
    }

    if (req.method === 'POST') {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
      const connectionString =
        typeof req.body?.connectionString === 'string' ? req.body.connectionString.trim() : ''
      const isDefault = req.body?.isDefault === true
      if (!name) return res.status(400).json({ error: 'name is required' })
      if (!connectionString) return res.status(400).json({ error: 'connectionString is required' })
      const item = createConnection({ name, connectionString, isDefault })
      return res.status(200).json({
        item: { id: item.id, name: item.name, isDefault: item.isDefault },
      })
    }

    if (req.method === 'PATCH') {
      const id = typeof req.body?.id === 'string' ? req.body.id.trim() : ''
      if (!id) return res.status(400).json({ error: 'id is required' })
      if (req.body?.setDefault === true) {
        const item = setDefaultConnection(id)
        if (!item) return res.status(404).json({ error: 'connection not found' })
        return res.status(200).json({ item: { id: item.id, name: item.name, isDefault: item.isDefault } })
      }
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined
      const connectionString =
        typeof req.body?.connectionString === 'string' ? req.body.connectionString.trim() : undefined
      const isDefault = typeof req.body?.isDefault === 'boolean' ? req.body.isDefault : undefined
      if (name === undefined && connectionString === undefined && isDefault === undefined) {
        return res.status(400).json({ error: 'name, connectionString, or isDefault is required' })
      }
      const item = updateConnection(id, { name, connectionString, isDefault })
      if (!item) return res.status(404).json({ error: 'connection not found' })
      return res.status(200).json({ item: { id: item.id, name: item.name, isDefault: item.isDefault } })
    }

    if (req.method === 'DELETE') {
      const id = typeof req.body?.id === 'string' ? req.body.id.trim() : ''
      if (!id) return res.status(400).json({ error: 'id is required' })
      const deleted = deleteConnection(id)
      if (!deleted) return res.status(404).json({ error: 'connection not found' })
      return res.status(200).json({ ok: true })
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const statusCode = (error as { statusCode?: number })?.statusCode || 400
    const fallbackStatus = message.includes('No database connections configured')
      ? 400
      : statusCode
    return res.status(fallbackStatus).json({ error: message })
  }
}
