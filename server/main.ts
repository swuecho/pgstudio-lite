import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { handleWebApiRequest, sendWebResponse, startWebScheduler, toWebRequest } from './web'

/**
 * Production web server: `npm run build && npm start`.
 *
 * Serves the Vite build from `dist/` with an `index.html` fallback for client
 * routes, and `/api/*` through the shared router. Bundled to `dist-server/`
 * by scripts/build-web-server.mjs; run from the repo root so the cwd-relative
 * runtime paths in lib/runtime-paths.ts resolve (migrations, Monaco, wasm).
 */

const PORT = Number(process.env.PORT) || 4180
const HOST = process.env.HOST || '127.0.0.1'
const DIST_DIR = resolve(process.env.PGSTUDIO_DIST_DIR || 'dist')

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
}

/** A file under dist/, the SPA shell for an extensionless client route, or null (404). */
function resolveStatic(pathname: string): string | null {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '')
  const full = resolve(DIST_DIR, relative)
  const inside = full === DIST_DIR || full.startsWith(DIST_DIR + sep)
  if (inside && relative && existsSync(full) && statSync(full).isFile()) return full
  // `/table-editor` is a client route; `/assets/missing.js` is a real 404.
  return extname(relative) ? null : join(DIST_DIR, 'index.html')
}

const server = createServer(async (req, res) => {
  try {
    const request = toWebRequest(req)
    const apiResponse = await handleWebApiRequest(request)
    if (apiResponse) return await sendWebResponse(res, apiResponse)

    const { pathname } = new URL(request.url)
    const file = resolveStatic(pathname)
    if (!file) {
      res.statusCode = 404
      return res.end('Not Found')
    }
    const isHtml = file.endsWith('.html')
    res.setHeader('Content-Type', CONTENT_TYPES[extname(file)] || 'application/octet-stream')
    // Vite fingerprints everything under /assets; the HTML shell must revalidate.
    res.setHeader('Cache-Control', isHtml ? 'no-cache' : 'public, max-age=31536000, immutable')
    createReadStream(file).pipe(res)
  } catch (error) {
    console.error('[server] request failed', error)
    if (!res.headersSent) res.statusCode = 500
    res.end()
  }
})

server.listen(PORT, HOST, () => {
  console.log(`PG Studio Lite listening on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`)
  void startWebScheduler()
})
