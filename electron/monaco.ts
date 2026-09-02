import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { getMonacoMinDir } from '@/lib/runtime-paths'

/**
 * Serves monaco-editor's AMD bundle and workers.
 *
 * The web build does this from `pages/api/monaco/[...path].ts` and
 * `pages/api/vs/[...path].ts`. Those two routes are static file servers rather
 * than real API handlers, so the desktop build serves them natively here
 * instead of routing them through the NextApiResponse shim — `res.send(Buffer)`
 * plus binary content types gains nothing from that indirection.
 *
 * The URL shapes are deliberately identical to the web build's, so
 * `loader.config({ paths: { vs: '/api/monaco' } })` in EditorPane.tsx,
 * JsonbCellEditor.tsx and SqlCellEditor.tsx needs no desktop-specific branch.
 */

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/

function contentTypeFor(filePath: string) {
  return CONTENT_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream'
}

/**
 * `pathname` is either `/api/monaco/<rest>` or `/api/vs/<rest>`.
 * Returns null when this is not a Monaco asset path at all.
 */
export function serveMonaco(pathname: string): Response | null {
  let rest: string
  if (pathname.startsWith('/api/monaco/')) {
    rest = pathname.slice('/api/monaco/'.length)
  } else if (pathname.startsWith('/api/vs/')) {
    rest = `vs/${pathname.slice('/api/vs/'.length)}`
  } else {
    return null
  }

  const segments = rest.split('/').filter((segment) => segment.length > 0)
  if (segments.length === 0 || !segments.every((segment) => SEGMENT_PATTERN.test(segment))) {
    return new Response('Bad Request', { status: 400 })
  }

  const root = resolve(getMonacoMinDir())
  const requested = segments.join('/')
  // Mirrors the web routes: tolerate a leading `min/`, and fall back to `vs/`
  // so `/api/monaco/loader.js` finds `min/vs/loader.js`.
  const normalized = requested.startsWith('min/') ? requested.slice(4) : requested
  const candidates = [normalized]
  if (!normalized.startsWith('vs/')) candidates.push(`vs/${normalized}`)

  for (const candidate of candidates) {
    const full = resolve(root, candidate)
    if (full !== root && !full.startsWith(root + sep)) continue
    try {
      if (!existsSync(full) || !statSync(full).isFile()) continue
      return new Response(readFileSync(full), {
        status: 200,
        headers: {
          'Content-Type': contentTypeFor(full),
          'Cache-Control': 'public, max-age=86400',
        },
      })
    } catch {
      continue
    }
  }

  return new Response('Not Found', { status: 404 })
}
