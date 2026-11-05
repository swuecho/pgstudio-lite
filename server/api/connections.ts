import { z } from 'zod'
import {
  createConnection,
  deleteConnection,
  getPublicConnections,
  setDefaultConnection,
  updateConnection,
} from '@/lib/db'
import { nonEmptyStringSchema, parseWithSchema } from '@/lib/api/validation'
import { CONNECTION_COLOR_IDS } from '@/lib/connection-color'
import { errorResponse } from '@/lib/api/errors'
import { defineRoute } from '@/server/route'

const connectionColorSchema = z.enum(CONNECTION_COLOR_IDS).nullable()

const createConnectionSchema = z.object({
  name: nonEmptyStringSchema,
  connectionString: nonEmptyStringSchema,
  isDefault: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  color: connectionColorSchema.optional(),
})

const patchConnectionSchema = z
  .object({
    id: nonEmptyStringSchema,
    setDefault: z.boolean().optional(),
    name: nonEmptyStringSchema.optional(),
    connectionString: nonEmptyStringSchema.optional(),
    isDefault: z.boolean().optional(),
    readOnly: z.boolean().optional(),
    color: connectionColorSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.setDefault === true) return
    if (
      value.name === undefined &&
      value.connectionString === undefined &&
      value.isDefault === undefined &&
      value.readOnly === undefined &&
      value.color === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'name, connectionString, isDefault, readOnly, or color is required',
      })
    }
  })

const deleteConnectionSchema = z.object({
  id: nonEmptyStringSchema,
})

type ConnectionItem = {
  id: string
  name: string
  isDefault: boolean
  readOnly: boolean
  color: string | null
}

/** Never echo the connection string back to the client. */
function publicItem(item: ConnectionItem) {
  return {
    id: item.id,
    name: item.name,
    isDefault: item.isDefault,
    readOnly: item.readOnly,
    color: item.color,
  }
}

export default defineRoute({
  GET() {
    const connections = getPublicConnections()
    const defaultConnectionName = connections.find((connection) => connection.isDefault)?.name || null
    return {
      connections,
      configured: connections.length > 0,
      defaultConnectionName,
    }
  },

  POST(req) {
    const { name, connectionString, isDefault, readOnly, color } = parseWithSchema(
      createConnectionSchema,
      req.body || {}
    )
    const item = createConnection({ name, connectionString, isDefault, readOnly, color })
    return { item: publicItem(item) }
  },

  PATCH(req) {
    const payload = parseWithSchema(patchConnectionSchema, req.body || {})
    const item =
      payload.setDefault === true
        ? setDefaultConnection(payload.id)
        : updateConnection(payload.id, {
            name: payload.name,
            connectionString: payload.connectionString,
            isDefault: payload.isDefault,
            readOnly: payload.readOnly,
            color: payload.color,
          })
    if (!item) return errorResponse(404, { error: 'connection not found' })
    return { item: publicItem(item) }
  },

  DELETE(req) {
    const { id } = parseWithSchema(deleteConnectionSchema, req.body || {})
    if (!deleteConnection(id)) return errorResponse(404, { error: 'connection not found' })
    return { ok: true }
  },
})
