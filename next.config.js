/**
 * Two build targets share this config:
 *
 *  - web (default): a Next server with `pages/api/**` handling requests.
 *  - desktop (`PGSTUDIO_TARGET=desktop`): a static export consumed by the
 *    Electron main process, which serves `out/` and dispatches `/api/*` to the
 *    same handler functions itself. See electron/protocol.ts.
 *
 * `pageExtensions: ['tsx', 'jsx']` is what excludes the API routes from the
 * desktop build: every file under `pages/api/**` is `.ts` while every page is
 * `.tsx`, so Next skips API-route discovery entirely and emits no server
 * bundle. `tests/desktop-routes.test.ts` enforces that invariant.
 *
 * Note there is deliberately no `assetPrefix` here. The './' trick exists for
 * `file://`, which has no origin; the desktop app serves from a real origin
 * (app://pgstudio), so Next's root-relative /_next/static URLs are correct and
 * './' would break them for pages below the root.
 */
const desktop = process.env.PGSTUDIO_TARGET === 'desktop'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(desktop
    ? {
        output: 'export',
        // With `output: 'export'` Next 16 treats distDir as the export
        // destination, so this holds the finished static site (not a build
        // cache). The Electron main process serves it verbatim. Kept separate
        // from `.next` so the two targets don't invalidate each other.
        distDir: 'out-desktop',
        pageExtensions: ['tsx', 'jsx'],
      }
    : {
        // Keep @pgsql/parser out of the server bundle so libpg-query.wasm resolves
        // from node_modules via __dirname instead of a rewritten /ROOT/ path.
        serverExternalPackages: ['@pgsql/parser'],
        outputFileTracingIncludes: {
          '/*': ['./node_modules/@pgsql/parser/wasm/**/*.wasm'],
        },
      }),
}

module.exports = nextConfig
