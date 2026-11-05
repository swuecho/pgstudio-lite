import { extname, join } from 'node:path'
import { Hono, type Context } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { CROSS_SITE_ERROR, isCrossSiteRequest } from '@/lib/api/same-origin'
import { handleApiRequest } from './router'

/**
 * The web build's request pipeline: the same-origin guard and the shared
 * `/api/*` router, plus — for the production server — the Vite build in
 * `distDir`. Used by the Vite dev server (vite.config.ts, no `distDir`) and the
 * production server (server/main.ts), both through @hono/node-server.
 *
 * The desktop app does not go through here: Electron's `app://` protocol calls
 * handleApiRequest() directly, and web content cannot reach that scheme, so
 * the cross-site check has nothing to guard there.
 */
export function createWebApp(options: { distDir?: string } = {}) {
  const app = new Hono()

  const api = async (c: Context) => {
    // Rejects state-changing requests from another site; see lib/api/same-origin.ts.
    const crossSite = isCrossSiteRequest({
      method: c.req.method,
      origin: c.req.header('origin') ?? null,
      secFetchSite: c.req.header('sec-fetch-site') ?? null,
      host: c.req.header('host') ?? null,
    })
    if (crossSite) return c.json(CROSS_SITE_ERROR, 403)

    // handleApiRequest only returns null outside /api, which these routes exclude.
    return (await handleApiRequest(c.req.raw)) ?? c.notFound()
  }
  app.all('/api', api)
  app.all('/api/*', api)

  const { distDir } = options
  if (distDir) {
    // Vite fingerprints everything under /assets; the HTML shell must revalidate.
    // Set after the fact: serveStatic's `onFound` runs once its response is
    // already built, so headers added there are lost.
    app.use('*', async (c, next) => {
      await next()
      if (!c.res.ok) return
      const html = c.res.headers.get('Content-Type')?.startsWith('text/html')
      c.res.headers.set('Cache-Control', html ? 'no-cache' : 'public, max-age=31536000, immutable')
    })
    app.use('*', serveStatic({ root: distDir }))
    // `/table-editor` is a client route and gets the SPA shell;
    // `/assets/missing.js` is a real 404.
    const shell = serveStatic({ path: join(distDir, 'index.html') })
    app.use('*', async (c, next) => (extname(c.req.path) ? c.text('Not Found', 404) : shell(c, next)))
  }

  return app
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
