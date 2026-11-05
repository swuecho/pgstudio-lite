import { runRoute, type RouteDefinition } from '@/server/route'

/**
 * Minimal API test harness. Import the route and call it with a request
 * shape; get back the status, payload, and response headers.
 *
 *   import route from '@/server/api/query'
 *   const res = await invokeApi(route, { method: 'POST', body: { query: 'select 1' } })
 *   expect(res.statusCode).toBe(200)
 *
 * Runs the route through the same `runRoute()` the real router uses, so method
 * dispatch and error normalization are exercised too.
 *
 * `vi.mock('@/lib/db', ...)` in the test file to keep Postgres out of it.
 * Vitest only picks up `tests/**\/*.test.ts(x)`, so this file is not a test.
 */

export type ApiCall = {
  /** Defaults to GET. */
  method?: string
  /** Route params (`[table]`, `[id]`) and query string values, merged as the router does. */
  query?: Record<string, unknown>
  body?: unknown
}

export type ApiResult<T = unknown> = {
  statusCode: number
  /** Parsed JSON for JSON responses, a Buffer for anything else, null when empty. */
  payload: T
  /** Response headers; look up with `getHeader` for case-insensitivity. */
  headers: Record<string, string>
  getHeader(name: string): string | undefined
}

export async function toApiResult<T = unknown>(response: Response): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })

  const contentType = response.headers.get('content-type') ?? ''
  let payload: unknown = null
  if (contentType.includes('json')) {
    const text = await response.text()
    payload = text ? JSON.parse(text) : null
  } else {
    const bytes = Buffer.from(await response.arrayBuffer())
    payload = bytes.byteLength > 0 ? bytes : null
  }

  return {
    statusCode: response.status,
    payload: payload as T,
    headers,
    getHeader: (name) => response.headers.get(name) ?? undefined,
  }
}

export async function invokeApi<T = unknown>(
  route: RouteDefinition,
  call: ApiCall = {}
): Promise<ApiResult<T>> {
  const response = await runRoute(route, {
    method: call.method ?? 'GET',
    query: (call.query ?? {}) as Record<string, string | string[]>,
    body: call.body,
  })
  return toApiResult<T>(response)
}
