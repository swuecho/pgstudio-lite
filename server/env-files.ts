import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Env files the web server reads at start-up, highest priority first. A
 * variable that is already set, by the shell or by an earlier file, is kept:
 * `process.loadEnvFile` never overwrites. So the shell beats `.env.local`,
 * which beats `.env` — the same order Next.js used before the Vite move.
 */
export const ENV_FILES = ['.env.local', '.env'] as const

/**
 * Loads `ENV_FILES` from `dir` into `process.env` and returns the names of the
 * files that existed. Called by the dev server (vite.config.ts) and the
 * production server (server/main.ts); the desktop app does not read env files.
 */
export function loadEnvFiles(dir: string = process.cwd()): string[] {
  const loaded: string[] = []
  for (const name of ENV_FILES) {
    const file = resolve(dir, name)
    if (!existsSync(file)) continue
    process.loadEnvFile(file)
    loaded.push(name)
  }
  return loaded
}
