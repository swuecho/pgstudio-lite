import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { CROSS_SITE_ERROR, isCrossSiteRequest } from '@/lib/api/same-origin'
import { handleApiRequest } from './router'

/**
 * The web build's request pipeline for `/api/*`: the same-origin guard, then
 * the shared router. Used by the Vite dev server (vite.config.ts) and the
 * production server (server/main.ts).
 *
 * The desktop app does not go through here: Electron's `app://` protocol calls
 * handleApiRequest() directly, and web content cannot reach that scheme, so
 * the cross-site check has nothing to guard there.
 */
export async function handleWebApiRequest(request: Request): Promise<Response | null> {
  const { pathname } = new URL(request.url)
  if (pathname !== '/api' && !pathname.startsWith('/api/')) return null

  // Rejects state-changing requests from another site; see lib/api/same-origin.ts.
  const crossSite = isCrossSiteRequest({
    method: request.method,
    origin: request.headers.get('origin'),
    secFetchSite: request.headers.get('sec-fetch-site'),
    host: request.headers.get('host'),
  })
  if (crossSite) return Response.json(CROSS_SITE_ERROR, { status: 403 })

  return handleApiRequest(request)
}

/** Node `IncomingMessage` -> Fetch `Request`. The body is streamed, not buffered. */
export function toWebRequest(req: IncomingMessage): Request {
  const host = req.headers.host ?? 'localhost'
  const url = new URL(req.url ?? '/', `http://${host}`)

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item))
    else headers.set(key, value)
  }

  const method = req.method ?? 'GET'
  const hasBody = method !== 'GET' && method !== 'HEAD'
  return new Request(url, {
    method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream<Uint8Array>) : undefined,
    // Required by undici whenever the body is a stream.
    ...(hasBody ? { duplex: 'half' } : {}),
  } as RequestInit)
}

/** Fetch `Response` -> Node `ServerResponse`. */
export async function sendWebResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  if (!response.body) {
    res.end()
    return
  }
  const body = Buffer.from(await response.arrayBuffer())
  res.setHeader('Content-Length', body.byteLength)
  res.end(body)
}

/**
 * Starts the notebook scheduler for the web build, unless
 * `PGSTUDIO_DISABLE_SCHEDULER=1`. The desktop app starts it itself from
 * electron/main.ts once the metadata DB is open.
 */
export async function startWebScheduler() {
  if (process.env.PGSTUDIO_DISABLE_SCHEDULER === '1') return
  const { startNotebookScheduler } = await import('@/lib/notebook-scheduler')
  startNotebookScheduler()
}
