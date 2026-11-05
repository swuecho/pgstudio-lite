import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { getRequestListener } from '@hono/node-server'

/**
 * Two build targets share this config:
 *
 *  - web (default): `vite build` emits `dist/`, served with `/api/*` by
 *    server/main.ts (`npm start`).
 *  - desktop (`PGSTUDIO_TARGET=desktop`): emits `out-desktop/`, which the
 *    Electron main process serves over `app://` and pairs with the same API
 *    router itself. See electron/protocol.ts.
 *
 * In dev, `/api/*` is answered inside the Vite server by the same router,
 * loaded through `ssrLoadModule` so edits under server/ and lib/ apply on the
 * next request without a restart.
 */
const desktop = process.env.PGSTUDIO_TARGET === 'desktop'

function apiDevServer(): Plugin {
  return {
    name: 'pgstudio-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      const load = () => server.ssrLoadModule('/server/web.ts') as Promise<typeof import('./server/web')>

      // Same start-up behaviour as `npm start`: the notebook scheduler runs in
      // the dev server unless PGSTUDIO_DISABLE_SCHEDULER=1.
      server.httpServer?.once('listening', () => {
        void load().then((web) => web.startWebScheduler())
      })

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !(req.url === '/api' || req.url.startsWith('/api/') || req.url.startsWith('/api?'))) {
          return next()
        }
        try {
          const web = await load()
          // overrideGlobalObjects: false, as in server/main.ts — and here it
          // would also swap Request/Response under Vite itself.
          await getRequestListener(web.createWebApp().fetch, { overrideGlobalObjects: false })(req, res)
        } catch (error) {
          next(error)
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), apiDevServer()],
  resolve: {
    // Mirrors the "@/*" paths mapping in tsconfig.json.
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  server: {
    port: 4180,
    strictPort: true,
  },
  preview: {
    port: 4180,
  },
  ssr: {
    // Native addon and wasm loader: load from node_modules, never transform.
    external: ['better-sqlite3', '@pgsql/parser'],
  },
  build: {
    outDir: desktop ? 'out-desktop' : 'dist',
    emptyOutDir: true,
    // Monaco is loaded at runtime from /api/monaco, so no chunk is huge; keep
    // the warning meaningful for app code.
    chunkSizeWarningLimit: 1500,
    sourcemap: true,
  },
})
