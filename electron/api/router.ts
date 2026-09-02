import { routes, type Route } from './routes'
import { invokeHandler, type ApiResult } from './shim'

type Segment =
  | { kind: 'static'; value: string }
  | { kind: 'dynamic'; name: string }
  | { kind: 'catchAll'; name: string }

type CompiledRoute = {
  route: Route
  segments: Segment[]
  /** Lower sorts first: static routes beat dynamic, dynamic beats catch-all. */
  rank: number
}

function compile(route: Route): CompiledRoute {
  const segments: Segment[] = route.pattern
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) => {
      if (part.startsWith('*')) return { kind: 'catchAll', name: part.slice(1) }
      if (part.startsWith(':')) return { kind: 'dynamic', name: part.slice(1) }
      return { kind: 'static', value: part }
    })

  // Rank mirrors Next's resolution order: an exact static path wins over a
  // single dynamic segment, which wins over a catch-all.
  const rank = segments.some((s) => s.kind === 'catchAll')
    ? 2
    : segments.some((s) => s.kind === 'dynamic')
      ? 1
      : 0

  return { route, segments, rank }
}

const compiled: CompiledRoute[] = routes.map(compile).sort((a, b) => a.rank - b.rank)

export type RouteMatch = {
  route: Route
  params: Record<string, string | string[]>
}

export function matchRoute(pathname: string): RouteMatch | null {
  const parts = pathname.split('/').filter((part) => part.length > 0)

  for (const candidate of compiled) {
    const params: Record<string, string | string[]> = {}
    let matched = true

    for (let i = 0; i < candidate.segments.length; i += 1) {
      const segment = candidate.segments[i]

      if (segment.kind === 'catchAll') {
        const rest = parts.slice(i)
        if (rest.length === 0) {
          matched = false
          break
        }
        params[segment.name] = rest.map((part) => decodeURIComponent(part))
        // A catch-all consumes everything, so this is a match by construction.
        return { route: candidate.route, params }
      }

      if (i >= parts.length) {
        matched = false
        break
      }
      if (segment.kind === 'static') {
        if (parts[i] !== segment.value) {
          matched = false
          break
        }
      } else {
        params[segment.name] = decodeURIComponent(parts[i])
      }
    }

    if (matched && parts.length === candidate.segments.length) {
      return { route: candidate.route, params }
    }
  }

  return null
}

/**
 * Build `req.query` the way Next does: search params first, then path params
 * overlaid on top (path params take precedence). Repeated search params become
 * arrays, which the zod preprocessors in lib/api/* already tolerate.
 */
export function buildQuery(
  searchParams: URLSearchParams,
  params: Record<string, string | string[]>
): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {}

  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key)
    query[key] = values.length > 1 ? values : values[0]
  }
  for (const [key, value] of Object.entries(params)) {
    query[key] = value
  }
  return query
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }

/**
 * A Node Buffer is a Uint8Array at runtime but is not typed as a `BodyInit`
 * (its backing store is `ArrayBufferLike`, not `ArrayBuffer`). Only the handful
 * of `res.send()` paths reach this with bytes, and those payloads are small, so
 * copying into a plain ArrayBuffer is cheaper than fighting the types.
 */
function toBodyInit(payload: Buffer | string): string | ArrayBuffer {
  if (typeof payload === 'string') return payload
  const copy = new ArrayBuffer(payload.byteLength)
  new Uint8Array(copy).set(payload)
  return copy
}

function errorResponse(status: number, error: string, code: string) {
  return new Response(JSON.stringify({ error, code }), { status, headers: JSON_HEADERS })
}

/**
 * Dispatch an `app://` request to a `pages/api` handler and convert the result
 * back into a Response.
 *
 * Bodies are read for every method that carries one — notably including
 * DELETE, which six call sites in features/* use with a JSON payload.
 */
export async function dispatchApi(request: Request, url: URL): Promise<Response> {
  const match = matchRoute(url.pathname)
  if (!match) return errorResponse(404, `No API route for ${url.pathname}`, 'NOT_FOUND')

  let body: unknown
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    let text = ''
    try {
      text = await request.text()
    } catch {
      return errorResponse(400, 'Could not read request body', 'INVALID_REQUEST')
    }
    if (text.length > 0) {
      try {
        body = JSON.parse(text)
      } catch {
        return errorResponse(400, 'Request body is not valid JSON', 'INVALID_REQUEST')
      }
    }
  }

  let result: ApiResult
  try {
    result = await invokeHandler(match.route.handler, {
      method: request.method,
      query: buildQuery(url.searchParams, match.params),
      body,
    })
  } catch (error) {
    // The handlers normalize their own errors via lib/api/errors.ts, so this is
    // only reached for genuinely unexpected throws. Log it — a swallowed stack
    // here would be invisible in a packaged app.
    console.error(`[api] ${request.method} ${url.pathname} threw`, error)
    return errorResponse(500, 'Internal Server Error', 'INTERNAL_ERROR')
  }

  const payload = result.raw ?? JSON.stringify(result.body ?? null)
  const headers: Record<string, string> = { ...JSON_HEADERS, ...result.headers }

  return new Response(toBodyInit(payload), { status: result.status, headers })
}
