import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import {
  createConnection,
  deleteConnection,
  getPublicConnections,
  setDefaultConnection,
  updateConnection,
} from '../../lib/db'
import { nonEmptyStringSchema, parseWithSchema } from '../../lib/api/validation'
import { methodNotAllowed, sendApiError } from '../../lib/api/errors'

const createConnectionSchema = z.object({
  name: nonEmptyStringSchema,
  connectionString: nonEmptyStringSchema,
  isDefault: z.boolean().optional(),
  readOnly: z.boolean().optional(),
})

const patchConnectionSchema = z
  .object({
    id: nonEmptyStringSchema,
    setDefault: z.boolean().optional(),
    name: nonEmptyStringSchema.optional(),
    connectionString: nonEmptyStringSchema.optional(),
    isDefault: z.boolean().optional(),
    readOnly: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.setDefault === true) return
    if (
      value.name === undefined &&
      value.connectionString === undefined &&
      value.isDefault === undefined &&
      value.readOnly === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'name, connectionString, isDefault, or readOnly is required',
      })
    }
  })

const deleteConnectionSchema = z.object({
  id: nonEmptyStringSchema,
})

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
      const { name, connectionString, isDefault, readOnly } = parseWithSchema(
        createConnectionSchema,
        req.body || {}
      )
      const item = createConnection({ name, connectionString, isDefault, readOnly })
      return res.status(200).json({
        item: { id: item.id, name: item.name, isDefault: item.isDefault, readOnly: item.readOnly },
      })
    }

    if (req.method === 'PATCH') {
      const payload = parseWithSchema(patchConnectionSchema, req.body || {})
      if (payload.setDefault === true) {
        const { id } = payload
        const item = setDefaultConnection(id)
        if (!item) return res.status(404).json({ error: 'connection not found' })
        return res.status(200).json({
          item: { id: item.id, name: item.name, isDefault: item.isDefault, readOnly: item.readOnly },
        })
      }
      const item = updateConnection(payload.id, {
        name: payload.name,
        connectionString: payload.connectionString,
        isDefault: payload.isDefault,
        readOnly: payload.readOnly,
      })
      if (!item) return res.status(404).json({ error: 'connection not found' })
      return res.status(200).json({
        item: { id: item.id, name: item.name, isDefault: item.isDefault, readOnly: item.readOnly },
      })
    }

    if (req.method === 'DELETE') {
      const { id } = parseWithSchema(deleteConnectionSchema, req.body || {})
      const deleted = deleteConnection(id)
      if (!deleted) return res.status(404).json({ error: 'connection not found' })
      return res.status(200).json({ ok: true })
    }

    return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE'])
  } catch (error) {
    return sendApiError(res, error)
  }
}
