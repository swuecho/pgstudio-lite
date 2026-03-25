import { existsSync, rmSync } from 'node:fs'
import { getMetaDbPath } from '../lib/meta-db-path'

const dbPath = getMetaDbPath()

for (const suffix of ['', '-wal', '-shm']) {
  const target = `${dbPath}${suffix}`
  if (existsSync(target)) rmSync(target, { force: true })
}
