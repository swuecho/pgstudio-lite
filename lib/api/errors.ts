type ErrorPayload = {
  error: string
  code?: string
  details?: unknown
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

export function methodNotAllowedResponse(methods: readonly string[]) {
  return Response.json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' } satisfies ErrorPayload, {
    status: 405,
    headers: { Allow: methods.join(', ') },
  })
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

/** The JSON error body for anything a route throws. */
export function apiErrorResponse(error: unknown) {
  const normalized = normalizeApiError(error)
  logApiErrorIfInternal(error, normalized)
  return Response.json(
    {
      error: normalized.message,
      code: normalized.code,
      details:
        normalized.statusCode < 500 && error && typeof error === 'object' && 'details' in error
          ? error.details
          : undefined,
    } satisfies ErrorPayload,
    { status: normalized.statusCode }
  )
}

/**
 * A JSON error body with an exact status, for the handful of routes whose
 * client-facing error shape predates ApiHttpError (`{ error: 'notebook not
 * found' }` with no code, 422 `validation_failed` with details).
 */
export function errorResponse(status: number, payload: ErrorPayload) {
  return Response.json(payload, { status })
}
