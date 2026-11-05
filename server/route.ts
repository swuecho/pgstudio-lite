import { apiErrorResponse, methodNotAllowedResponse } from '@/lib/api/errors'

/**
 * Framework-free API routes.
 *
 * A route is a map from HTTP method to a plain function. The function gets the
 * parsed request and returns either data (sent as a 200 JSON body) or a
 * `Response` when it needs a different status, headers or a binary body.
 * Throwing is the error path: everything thrown goes through
 * `apiErrorResponse()` in lib/api/errors.ts.
 *
 * The same route table serves every runtime — the Electron `app://` protocol,
 * the web server, and the tests — through `handleApiRequest()` in
 * server/router.ts, so no handler knows which one it is running in.
 */

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
export type HttpMethod = (typeof HTTP_METHODS)[number]

export type RouteQuery = Record<string, string | string[]>

export type RouteContext = {
  method: HttpMethod
  /**
   * Search params with path params (`:table`, `:id`) overlaid, path params
   * winning. Repeated search params become arrays. This is the merged shape
   * the zod schemas in each route were written against.
   */
  query: RouteQuery
  /** Parsed JSON body, or undefined when the request had none. */
  body: unknown
}

export type RouteHandler = (ctx: RouteContext) => unknown

export type RouteDefinition = Partial<Record<HttpMethod, RouteHandler>>

/** Identity function; exists so route files get the handler types inferred. */
export function defineRoute<T extends RouteDefinition>(definition: T): T {
  return definition
}

function isHttpMethod(method: string): method is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(method)
}

export function allowedMethods(route: RouteDefinition): HttpMethod[] {
  return HTTP_METHODS.filter((method) => route[method] !== undefined)
}

/**
 * Run one route against an already-parsed request. Never throws: handler
 * errors become the JSON error body from lib/api/errors.ts.
 */
export async function runRoute(
  route: RouteDefinition,
  input: { method: string; query: RouteQuery; body: unknown }
): Promise<Response> {
  const method = input.method.toUpperCase()
  const handler = isHttpMethod(method) ? route[method] : undefined
  if (!handler || !isHttpMethod(method)) return methodNotAllowedResponse(allowedMethods(route))

  try {
    const result = await handler({ method, query: input.query, body: input.body })
    if (result instanceof Response) return result
    return Response.json(result ?? null)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
