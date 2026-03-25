import { existsSync, rmSync } from 'node:fs'
import { getMetaDbPath } from '../lib/meta-db-path'

process.env.SKIP_RUNTIME_MIGRATE = '0'

declare global {
  var __pgstudioVitestDbCleaned__: boolean | undefined
}

if (!globalThis.__pgstudioVitestDbCleaned__) {
  const dbPath = getMetaDbPath()

  for (const suffix of ['', '-wal', '-shm']) {
    const target = `${dbPath}${suffix}`
    if (existsSync(target)) rmSync(target, { force: true })
  }

  globalThis.__pgstudioVitestDbCleaned__ = true
}
