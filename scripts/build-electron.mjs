/**
 * Bundles the Electron main process and preload with esbuild.
 *
 * Only `electron` itself is external. Everything else — `pg`, `drizzle-orm`,
 * `zod`, better-sqlite3's JS wrapper, and all 28 `pages/api` handlers reached
 * through electron/api/routes.ts — is bundled, so the packaged app carries no
 * `node_modules` at all.
 */
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const watch = process.argv.includes('--watch')
const dev = watch || process.argv.includes('--dev')

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // Electron 42 ships Node 24; targeting node22 is a safe floor.
  target: 'node22',
  external: ['electron'],
  // Mirrors tsconfig.json's `@/*` path alias.
  alias: { '@': repoRoot },
  sourcemap: true,
  minify: !dev,
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
}

const targets = [
  {
    entryPoints: [join(repoRoot, 'electron', 'main.ts')],
    outfile: join(repoRoot, 'dist-electron', 'main.js'),
  },
  {
    entryPoints: [join(repoRoot, 'electron', 'preload.ts')],
    outfile: join(repoRoot, 'dist-electron', 'preload.js'),
  },
]

for (const target of targets) {
  await build({ ...shared, ...target })
}
console.log(`built dist-electron (${dev ? 'development' : 'production'})`)
