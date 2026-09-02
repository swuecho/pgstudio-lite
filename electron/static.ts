import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { getRendererDir } from './paths'

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
}

/** Above this, stream rather than buffering the whole file into memory. */
const STREAM_THRESHOLD_BYTES = 256 * 1024

const CSP = [
  "default-src 'none'",
  // blob: is required by Monaco, whose worker factory builds a blob URL that
  // importScripts() the real worker from our origin.
  "script-src 'self' app: blob:",
  "worker-src 'self' app: blob:",
  // Monaco injects <style> elements at runtime; unavoidable, and low risk in an
  // app that loads no remote content.
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "connect-src 'self' app:",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ')

function contentTypeFor(filePath: string) {
  return CONTENT_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream'
}

function isFile(candidate: string) {
  try {
    return existsSync(candidate) && statSync(candidate).isFile()
  } catch {
    return false
  }
}

/**
 * Resolve a request path against the exported site.
 *
 * The export emits `activity.html` while in-app links point at `/activity`, so
 * the `.html` suffix fallback is what makes both deep links and client-side
 * navigation reload correctly.
 */
function resolveFile(pathname: string): string | null {
  const root = resolve(getRendererDir())
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '')
  const base = relative === '' ? 'index.html' : relative

  const candidates = [base, `${base}.html`, join(base, 'index.html')]
  for (const candidate of candidates) {
    const full = resolve(root, candidate)
    // Path traversal guard: never serve outside the renderer directory.
    if (full !== root && !full.startsWith(root + sep)) continue
    if (isFile(full)) return full
  }
  return null
}

function respond(filePath: string, status: number) {
  const type = contentTypeFor(filePath)
  const isHtml = type.startsWith('text/html')
  const headers: Record<string, string> = {
    'Content-Type': type,
    // Chunk filenames are content-hashed, so they are safe to cache hard.
    // HTML must not be, or a stale shell survives an app update.
    'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=31536000, immutable',
  }
  if (isHtml) headers['Content-Security-Policy'] = CSP

  const size = statSync(filePath).size
  if (size > STREAM_THRESHOLD_BYTES) {
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>
    return new Response(stream, { status, headers })
  }
  return new Response(readFileSync(filePath), { status, headers })
}

export function serveStatic(pathname: string): Response {
  const found = resolveFile(pathname)
  if (found) return respond(found, 200)

  const notFoundPage = resolve(getRendererDir(), '404.html')
  if (isFile(notFoundPage)) return respond(notFoundPage, 404)
  return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
