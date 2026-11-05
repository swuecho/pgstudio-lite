import { Hono } from 'hono'
import { routes, type Route } from './routes'
import { runRoute, type RouteQuery } from './route'
import { serveMonaco } from './monaco'

function errorResponse(status: number, error: string, code: string) {
  return Response.json({ error, code }, { status })
}

/**
 * Lower sorts first: static routes beat dynamic, dynamic beats catch-all.
 * Hono tries matching handlers in registration order, so registering in this
 * order keeps `/api/notebooks/import` ahead of `/api/notebooks/:id` whatever
 * order server/routes.ts lists them in.
 */
function specificity(pattern: string) {
  if (pattern.includes('*')) return 2
  if (pattern.includes(':')) return 1
  return 0
}

/**
 * Build the route's `query`: search params first, then path params overlaid on
 * top (path params take precedence). Repeated search params become arrays,
 * which the zod preprocessors in lib/api/* already tolerate.
 */
export function buildQuery(
  searchParams: URLSearchParams,
  params: Record<string, string | string[]>
): RouteQuery {
  const query: RouteQuery = {}

  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key)
    query[key] = values.length > 1 ? values : values[0]
  }
  for (const [key, value] of Object.entries(params)) {
    query[key] = value
  }
  return query
}

/**
 * Bodies are read for every method that carries one — notably including
 * DELETE, which several call sites in features/* use with a JSON payload.
 * An empty body is `undefined`, not an error.
 */
async function readJsonBody(request: Request): Promise<{ body: unknown } | { error: Response }> {
  if (request.method === 'GET' || request.method === 'HEAD') return { body: undefined }

  let text = ''
  try {
    text = await request.text()
  } catch {
    return { error: errorResponse(400, 'Could not read request body', 'INVALID_REQUEST') }
  }
  if (text.length === 0) return { body: undefined }
  try {
    return { body: JSON.parse(text) }
  } catch {
    return { error: errorResponse(400, 'Request body is not valid JSON', 'INVALID_REQUEST') }
  }
}

/**
 * The Hono app behind `/api/*`. Hono does the path matching; each route's
 * `defineRoute` methods are still dispatched by runRoute(), which owns the 405
 * response and error normalization, so route files and `invokeApi` tests do
 * not depend on Hono.
 *
 * Takes the route table as a parameter so tests can mount stub handlers.
 */
export function createApiApp(table: readonly Route[] = routes) {
  // strict: false keeps `/api/tables/` matching `/api/tables`.
  const app = new Hono({ strict: false })

  // Static file servers for monaco-editor; see server/monaco.ts.
  const monaco = (request: Request) => serveMonaco(new URL(request.url).pathname)
  app.get('/api/monaco/*', (c) => monaco(c.req.raw) ?? c.notFound())
  app.get('/api/vs/*', (c) => monaco(c.req.raw) ?? c.notFound())

  const ordered = [...table].sort((a, b) => specificity(a.pattern) - specificity(b.pattern))
  for (const route of ordered) {
    app.all(route.pattern, async (c) => {
      const parsed = await readJsonBody(c.req.raw)
      if ('error' in parsed) return parsed.error

      return runRoute(route.handler, {
        method: c.req.method,
        query: buildQuery(new URL(c.req.url).searchParams, c.req.param()),
        body: parsed.body,
      })
    })
  }

  app.notFound((c) => errorResponse(404, `No API route for ${c.req.path}`, 'NOT_FOUND'))

  // runRoute normalizes handler errors itself, so this is only reached for
  // genuinely unexpected throws. Log it — a swallowed stack here would be
  // invisible in a packaged app.
  app.onError((error, c) => {
    console.error(`[api] ${c.req.method} ${c.req.path} threw`, error)
    return errorResponse(500, 'Internal Server Error', 'INTERNAL_ERROR')
  })

  return app
}

const apiApp = createApiApp()

export function isApiPath(pathname: string) {
  return pathname === '/api' || pathname.startsWith('/api/')
}

/**
 * The single entry point for `/api/*`, shared by the Electron `app://`
 * protocol, the web server, and the Vite dev server. Returns null for paths
 * outside `/api`, so callers can fall through to static files.
 */
export async function handleApiRequest(request: Request): Promise<Response | null> {
  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return null
  }
  if (!isApiPath(url.pathname)) return null
  return apiApp.fetch(request)
}
