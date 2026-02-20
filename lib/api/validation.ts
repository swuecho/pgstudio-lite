import { z } from 'zod'

export const nonEmptyStringSchema = z.string().trim().min(1)

export const optionalSchemaNameSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  },
  z.string().min(1).optional()
)

export const optionalConnectionNameSchema = optionalSchemaNameSchema

export function parseWithSchema<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  const message = result.error.issues[0]?.message || 'Invalid request payload'
  const error = new Error(message) as Error & { statusCode?: number }
  error.statusCode = 400
  throw error
}
