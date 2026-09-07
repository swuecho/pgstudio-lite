import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * Minimal Next API test harness. Import the route handler and call it with a
 * request shape; get back the status, JSON payload, and response headers.
 *
 *   import handler from '@/pages/api/query'
 *   const res = await invokeApi(handler, { method: 'POST', body: { query: 'select 1' } })
 *   expect(res.statusCode).toBe(200)
 *
 * `vi.mock('@/lib/db', ...)` in the test file to keep Postgres out of it.
 * Vitest only picks up `tests/**\/*.test.ts(x)`, so this file is not a test.
 */

export type ApiHandler = (req: NextApiRequest, res: NextApiResponse) => unknown

export type ApiCall = {
  /** Defaults to GET. */
  method?: string
  /** Route params (`[table]`, `[id]`) and query string values, as Next merges them. */
  query?: Record<string, unknown>
  body?: unknown
  headers?: Record<string, string>
}

export type ApiResult<T = unknown> = {
  statusCode: number
  /** Whatever the handler passed to `res.json()` / `res.send()`, or null. */
  payload: T
  /** Response headers as set by the handler; look up with `getHeader` for case-insensitivity. */
  headers: Record<string, string>
  getHeader(name: string): string | undefined
}

export function createMockRes() {
  const headers: Record<string, string> = {}
  const state = { statusCode: 200, payload: null as unknown }

  const res = {
    setHeader(name: string, value: string | number | readonly string[]) {
      headers[name] = Array.isArray(value) ? value.join(', ') : String(value)
      return res
    },
    getHeader(name: string) {
      const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase())
      return key === undefined ? undefined : headers[key]
    },
    removeHeader(name: string) {
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === name.toLowerCase()) delete headers[key]
      }
    },
    status(code: number) {
      state.statusCode = code
      return res
    },
    json(body: unknown) {
      state.payload = body
      return res
    },
    send(body: unknown) {
      state.payload = body
      return res
    },
    end(body?: unknown) {
      if (body !== undefined) state.payload = body
      return res
    },
  }

  const result = <T = unknown>(): ApiResult<T> => ({
    statusCode: state.statusCode,
    payload: state.payload as T,
    headers,
    getHeader: res.getHeader,
  })

  return { res: res as unknown as NextApiResponse, result }
}

export function createMockReq(call: ApiCall = {}): NextApiRequest {
  return {
    method: call.method ?? 'GET',
    query: call.query ?? {},
    body: call.body,
    headers: call.headers ?? {},
  } as unknown as NextApiRequest
}

export async function invokeApi<T = unknown>(handler: ApiHandler, call: ApiCall = {}): Promise<ApiResult<T>> {
  const { res, result } = createMockRes()
  await handler(createMockReq(call), res)
  return result<T>()
}
