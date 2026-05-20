import type { NextApiResponse } from 'next'

type ErrorPayload = {
  error: string
  code?: string
}

export class ApiHttpError extends Error {
  statusCode: number
  code?: string

  constructor(statusCode: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiHttpError'
    this.statusCode = statusCode
    this.code = code
  }
}

function hasStatusCode(error: unknown): error is { statusCode: number; message?: string; code?: string } {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'statusCode' in error &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number'
  )
}

export function badRequest(message: string, code?: string) {
  return new ApiHttpError(400, message, code)
}

export function methodNotAllowed(res: NextApiResponse, methods: string[]) {
  res.setHeader('Allow', methods.join(', '))
  return res
    .status(405)
    .json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' } satisfies ErrorPayload)
}

export function normalizeApiError(error: unknown): ApiHttpError {
  if (error instanceof ApiHttpError) return error

  if (hasStatusCode(error)) {
    return new ApiHttpError(
      error.statusCode,
      typeof error.message === 'string' && error.message.trim() ? error.message : 'Request failed',
      typeof error.code === 'string' ? error.code : undefined
    )
  }

  const message = error instanceof Error ? error.message : String(error)
  const text = message.toLowerCase()

  if (text.includes('not found')) return new ApiHttpError(404, message, 'NOT_FOUND')
  if (text.includes('already exists') || text.includes('unique constraint')) {
    return new ApiHttpError(409, message, 'CONFLICT')
  }
  if (text.includes('required') || text.includes('invalid') || text.includes('must be')) {
    return new ApiHttpError(400, message, 'INVALID_REQUEST')
  }

  return new ApiHttpError(500, 'Internal server error', 'INTERNAL_ERROR')
}

export function logApiErrorIfInternal(error: unknown, normalized: ApiHttpError) {
  if (normalized.statusCode !== 500) return

  const prefix = '[api] 500'
  if (error instanceof Error) {
    console.error(`${prefix}:`, error.message)
    if (error.stack) console.error(error.stack)
    if (error !== normalized && normalized.message !== error.message) {
      console.error(`${prefix} client message:`, normalized.message)
    }
    return
  }

  console.error(prefix, error)
}

export function sendApiError(res: NextApiResponse, error: unknown) {
  const normalized = normalizeApiError(error)
  logApiErrorIfInternal(error, normalized)
  return res.status(normalized.statusCode).json({
    error: normalized.message,
    code: normalized.code,
  } satisfies ErrorPayload)
}
