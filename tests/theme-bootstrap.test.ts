import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { themeBootstrapScript } from '../lib/theme'

describe('public/theme-bootstrap.js', () => {
  it('matches themeBootstrapScript()', () => {
    // The file is committed so `next dev` needs no prebuild step, and
    // `_document.tsx` loads it as an external script because the desktop build
    // serves the renderer without `script-src 'unsafe-inline'`. This test is
    // what keeps it from drifting from lib/theme.ts. Regenerate with:
    //   node scripts/generate-theme-bootstrap.mjs
    const onDisk = readFileSync(join(process.cwd(), 'public', 'theme-bootstrap.js'), 'utf8')
    expect(onDisk.trim()).toBe(themeBootstrapScript().trim())
  })
})
