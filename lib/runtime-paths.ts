import { isAbsolute, join, resolve } from 'node:path'

/**
 * Every runtime asset path the server-side code needs, resolved in one place.
 *
 * `process.cwd()` used to be baked into five call sites. That works for `next
 * dev`/`next start`/vitest, where cwd is the repo root, and breaks in a
 * packaged desktop app: cwd there is arbitrary (often `/`), the bundle is
 * read-only and code-signed, and `node_modules` may not exist at all.
 *
 * The desktop main process calls `setRuntimePaths()` once at startup to point
 * these at `app.getPath('userData')` and `process.resourcesPath`. Everything
 * else keeps the cwd-relative defaults, so web and test behaviour is unchanged.
 *
 * This module must NEVER import `electron` — it is imported by `lib/*`, which
 * the web build compiles and vitest runs.
 */
export type RuntimePaths = {
  /** Writable state. Desktop: app.getPath('userData'). */
  userDataDir: string
  /** Drizzle migration folder, read at runtime by lib/meta-db.ts. */
  migrationsDir: string
  /** Directory holding libpg-query.js + libpg-query.wasm. */
  pgParserWasmDir: string
  /** monaco-editor's `min` directory, served to the renderer. */
  monacoMinDir: string
  /**
   * Absolute path to an Electron-ABI `better_sqlite3.node`. Set only in a
   * packaged app; `undefined` elsewhere so better-sqlite3 resolves its own
   * Node-ABI build via `bindings` exactly as it does today.
   */
  sqliteNativeBinding?: string
}

const PG_PARSER_VERSION = 17

let injected: RuntimePaths | null = null

/** Called once by the Electron main process, before any lib/db access. */
export function setRuntimePaths(paths: RuntimePaths) {
  injected = paths
}

/** Test-only: drop an injected override. */
export function resetRuntimePaths() {
  injected = null
}

function defaultPaths(): RuntimePaths {
  const cwd = process.cwd()
  return {
    userDataDir: join(cwd, 'data'),
    migrationsDir: join(cwd, 'drizzle', 'migrations'),
    pgParserWasmDir: join(cwd, 'node_modules', '@pgsql', 'parser', 'wasm', `v${PG_PARSER_VERSION}`),
    monacoMinDir: join(cwd, 'node_modules', 'monaco-editor', 'min'),
  }
}

/**
 * Resolve one path, preferring an explicit env override, then the injected
 * desktop paths, then the cwd-relative default. Relative env values resolve
 * against the base the injected/default value came from, so
 * `PGSTUDIO_MONACO_DIR=vendor/monaco` behaves sensibly in both runtimes.
 */
function pathFor(key: keyof RuntimePaths, envVar: string): string {
  const override = process.env[envVar]?.trim()
  const base = injected ?? defaultPaths()
  const fallback = base[key] as string
  if (!override) return fallback
  return isAbsolute(override) ? override : resolve(process.cwd(), override)
}

export function getUserDataDir(): string {
  return pathFor('userDataDir', 'PGSTUDIO_USER_DATA_DIR')
}

export function getMigrationsDir(): string {
  return pathFor('migrationsDir', 'PGSTUDIO_MIGRATIONS_DIR')
}

export function getPgParserWasmDir(): string {
  return pathFor('pgParserWasmDir', 'PGSTUDIO_PG_PARSER_WASM_DIR')
}

export function getMonacoMinDir(): string {
  return pathFor('monacoMinDir', 'PGSTUDIO_MONACO_DIR')
}

export function getSqliteNativeBinding(): string | undefined {
  const override = process.env.PGSTUDIO_SQLITE_NATIVE_BINDING?.trim()
  if (override) return isAbsolute(override) ? override : resolve(process.cwd(), override)
  return injected?.sqliteNativeBinding
}
