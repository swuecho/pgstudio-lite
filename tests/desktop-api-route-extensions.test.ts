import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const API_DIR = join(process.cwd(), 'pages', 'api')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

describe('pages/api file extensions', () => {
  it('are all .ts, never .tsx', () => {
    // The desktop build excludes API routes via `pageExtensions: ['tsx','jsx']`
    // in next.config.js. A `.tsx` API route would be picked up as a page and
    // break the static export, so fail loudly here instead.
    const offenders = walk(API_DIR).filter((file) => !file.endsWith('.ts'))
    expect(offenders).toEqual([])
  })
})
