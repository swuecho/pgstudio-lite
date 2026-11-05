import { resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { createWebApp, startWebScheduler } from './web'

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

const app = createWebApp({ distDir: DIST_DIR })

serve(
  {
    fetch: app.fetch,
    port: PORT,
    hostname: HOST,
    // Keep the platform Request/Response: route handlers and runRoute() use
    // `instanceof Response`, which node-server's lightweight classes would break.
    overrideGlobalObjects: false,
  },
  () => {
    console.log(`PG Studio Lite listening on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`)
    void startWebScheduler()
  }
)
