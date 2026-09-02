import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { isMainThread, threadId } from 'node:worker_threads'
import { getUserDataDir } from './runtime-paths'

export function getMetaDbPath() {
  const explicitPath = process.env.PGSTUDIO_META_DB_PATH?.trim()
  if (explicitPath) {
    // Relative values resolve against the writable data directory rather than
    // cwd, so a packaged desktop app can still honour this override.
    return resolve(getUserDataDir(), explicitPath)
  }

  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    const workerId =
      process.env.VITEST_POOL_ID?.trim() ||
      process.env.VITEST_WORKER_ID?.trim() ||
      (isMainThread ? 'main' : `thread-${threadId}`)
    return join(tmpdir(), 'pgstudio-lite-vitest', `history-${process.pid}-${workerId}.db`)
  }

  return join(getUserDataDir(), 'history.db')
}

export function getMetaDbDir() {
  return dirname(getMetaDbPath())
}
