/**
 * Bundles the production web server (server/main.ts) with esbuild.
 *
 * Unlike the Electron bundle, every npm package stays external and is loaded
 * from node_modules at runtime: the web build always runs from a checkout with
 * dependencies installed, and better-sqlite3 / @pgsql/parser must resolve their
 * native addon and wasm from there anyway.
 */
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

await build({
  entryPoints: [join(repoRoot, 'server', 'main.ts')],
  outfile: join(repoRoot, 'dist-server', 'main.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  // Mirrors tsconfig.json's `@/*` path alias.
  alias: { '@': repoRoot },
  sourcemap: true,
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
})
