/**
 * Builds the static renderer for the desktop app.
 *
 * Equivalent to `PGSTUDIO_TARGET=desktop next build`, but as a script so it
 * runs on Windows too: npm executes package scripts through cmd.exe there, which
 * does not understand `VAR=value command`. Regenerates the theme bootstrap
 * first so the committed file cannot drift in a release build.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const nextBin = require.resolve('next/dist/bin/next')

const run = (args, env = {}) =>
  execFileSync(process.execPath, args, { cwd: repoRoot, stdio: 'inherit', env: { ...process.env, ...env } })

run([join(repoRoot, 'scripts', 'generate-theme-bootstrap.mjs')])
run([nextBin, 'build'], { PGSTUDIO_TARGET: 'desktop' })
