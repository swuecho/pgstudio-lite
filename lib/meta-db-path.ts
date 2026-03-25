import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { isMainThread, threadId } from 'node:worker_threads'

export function getMetaDbPath() {
  const explicitPath = process.env.PGSTUDIO_META_DB_PATH?.trim()
  if (explicitPath) {
    return resolve(process.cwd(), explicitPath)
  }

  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    const workerId = process.env.VITEST_POOL_ID?.trim() || process.env.VITEST_WORKER_ID?.trim() || (isMainThread ? 'main' : `thread-${threadId}`)
    return join(tmpdir(), 'pgstudio-lite-vitest', `history-${process.pid}-${workerId}.db`)
  }

  return join(process.cwd(), 'data', 'history.db')
}

export function getMetaDbDir() {
  return dirname(getMetaDbPath())
}
