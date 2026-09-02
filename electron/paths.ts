import { app } from 'electron'
import { join } from 'node:path'
import { setRuntimePaths } from '@/lib/runtime-paths'

/**
 * Main-process path resolution. Unlike `lib/runtime-paths.ts`, this module may
 * import `electron` — it is only ever loaded by the main process.
 *
 * In a packaged app everything the code reads from disk lives in
 * `Contents/Resources/` (via electron-builder `extraResources`), outside
 * `app.asar`: `.node` addons cannot be required from an asar, and emscripten's
 * wasm loading does not cope with the asar virtual filesystem.
 */

/** The exported Next site the renderer is served from. */
export function getRendererDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'renderer') : join(app.getAppPath(), 'out-desktop')
}

/**
 * Point `lib/*` at OS-appropriate locations. Must run before anything touches
 * the metadata DB or the SQL parser.
 */
export function installRuntimePaths() {
  const packaged = app.isPackaged
  const resources = packaged ? process.resourcesPath : app.getAppPath()

  setRuntimePaths({
    userDataDir: app.getPath('userData'),
    migrationsDir: join(resources, 'drizzle', 'migrations'),
    pgParserWasmDir: packaged
      ? join(resources, 'pgsql-parser', 'wasm', 'v17')
      : join(resources, 'node_modules', '@pgsql', 'parser', 'wasm', 'v17'),
    monacoMinDir: packaged
      ? join(resources, 'monaco', 'min')
      : join(resources, 'node_modules', 'monaco-editor', 'min'),
    // Always the Electron-ABI addon, packaged or not: Electron's
    // NODE_MODULE_VERSION differs from the Node the repo targets, so the build
    // in node_modules cannot be loaded here at all. Produced by
    // scripts/build-sqlite-native.mjs.
    sqliteNativeBinding: packaged
      ? join(resources, 'native', 'better_sqlite3.node')
      : join(resources, 'native', `${process.platform}-${process.arch}`, 'better_sqlite3.node'),
  })
}
