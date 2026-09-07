import { describe, expect, it, vi } from 'vitest'
import { createMockRes } from './helpers/invoke-api'
import { ApiHttpError, logApiErrorIfInternal, methodNotAllowed, normalizeApiError } from '../lib/api/errors'

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
    const { res, result } = createMockRes()
    methodNotAllowed(res, ['GET', 'POST'])
    expect(result().getHeader('Allow')).toBe('GET, POST')
    expect(result().statusCode).toBe(405)
    expect(result().payload).toEqual({
      error: 'Method not allowed',
      code: 'METHOD_NOT_ALLOWED',
    })
  })
})
