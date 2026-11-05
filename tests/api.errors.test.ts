import { describe, expect, it, vi } from 'vitest'
import {
  ApiHttpError,
  apiErrorResponse,
  logApiErrorIfInternal,
  methodNotAllowedResponse,
  normalizeApiError,
} from '../lib/api/errors'

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

  it('returns 405 with Allow header', async () => {
    const response = methodNotAllowedResponse(['GET', 'POST'])
    expect(response.headers.get('Allow')).toBe('GET, POST')
    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({
      error: 'Method not allowed',
      code: 'METHOD_NOT_ALLOWED',
    })
  })

  it('serializes thrown errors with their status, code and client-safe details', async () => {
    const error = Object.assign(new ApiHttpError(400, 'bad cell', 'INVALID_REQUEST'), {
      details: { cell: 2 },
    })
    const response = apiErrorResponse(error)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'bad cell',
      code: 'INVALID_REQUEST',
      details: { cell: 2 },
    })
  })
})
