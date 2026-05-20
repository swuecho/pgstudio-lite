import { describe, expect, it, vi } from 'vitest'
import { ApiHttpError, logApiErrorIfInternal, methodNotAllowed, normalizeApiError } from '../lib/api/errors'

function createMockResponse() {
  const headers = new Map<string, string>()
  let statusCode = 200
  let payload: unknown = null
  return {
    setHeader(key: string, value: string) {
      headers.set(key, value)
    },
    status(code: number) {
      statusCode = code
      return {
        json(body: unknown) {
          payload = body
          return body
        },
      }
    },
    getHeader(key: string) {
      return headers.get(key)
    },
    getStatusCode() {
      return statusCode
    },
    getPayload() {
      return payload
    },
  }
}

describe('api error helpers', () => {
  it('keeps ApiHttpError unchanged', () => {
    const error = new ApiHttpError(409, 'duplicate key', 'CONFLICT')
    const normalized = normalizeApiError(error)
    expect(normalized).toBe(error)
  })

  it('maps "not found" messages to 404', () => {
    const normalized = normalizeApiError(new Error('notebook not found'))
    expect(normalized.statusCode).toBe(404)
    expect(normalized.code).toBe('NOT_FOUND')
  })

  it('maps unexpected errors to 500', () => {
    const normalized = normalizeApiError(new Error('boom'))
    expect(normalized.statusCode).toBe(500)
    expect(normalized.code).toBe('INTERNAL_ERROR')
    expect(normalized.message).toBe('Internal server error')
  })

  it('logs original error stack for internal server errors', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('row.columns.map is not a function')
    const normalized = normalizeApiError(error)

    logApiErrorIfInternal(error, normalized)

    expect(consoleError).toHaveBeenCalled()
    expect(consoleError.mock.calls.some((call) => String(call[0]).includes('500'))).toBe(true)
    expect(consoleError.mock.calls.some((call) => String(call[0]).includes('row.columns.map'))).toBe(true)
    expect(consoleError.mock.calls.some((call) => String(call[1] || '').includes('row.columns.map'))).toBe(
      true
    )
    consoleError.mockRestore()
  })

  it('does not log client errors', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const normalized = normalizeApiError(new Error('notebook not found'))

    logApiErrorIfInternal(new Error('notebook not found'), normalized)

    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('returns 405 with Allow header', () => {
    const res = createMockResponse()
    methodNotAllowed(res as any, ['GET', 'POST'])
    expect(res.getHeader('Allow')).toBe('GET, POST')
    expect(res.getStatusCode()).toBe(405)
    expect(res.getPayload()).toEqual({
      error: 'Method not allowed',
      code: 'METHOD_NOT_ALLOWED',
    })
  })
})
