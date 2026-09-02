/**
 * Generates `public/theme-bootstrap.js` from `themeBootstrapScript()`.
 *
 * The pre-paint theme script used to be inlined into `<head>` via
 * `dangerouslySetInnerHTML`. The desktop build serves the renderer under a
 * strict CSP, and allowing `script-src 'unsafe-inline'` just for this one
 * script would weaken the whole page — so it ships as an external file
 * instead. Still parser-blocking, still runs before first paint.
 *
 * The output is committed so `next dev` needs no prebuild step;
 * `tests/theme-bootstrap.test.ts` fails if it drifts from the source.
 */
import { build } from 'esbuild'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
export const OUTPUT_PATH = join(repoRoot, 'public', 'theme-bootstrap.js')

export async function renderThemeBootstrap() {
  // lib/theme.ts is TypeScript, so bundle it to a data URL and import that
  // rather than duplicating the script body here.
  const result = await build({
    stdin: {
      contents: `export { themeBootstrapScript } from './lib/theme'`,
      resolveDir: repoRoot,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
  })
  const source = result.outputFiles[0].text
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
  return `${module.themeBootstrapScript()}\n`
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const contents = await renderThemeBootstrap()
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
  writeFileSync(OUTPUT_PATH, contents)
  console.log(`wrote ${OUTPUT_PATH} (${contents.length} bytes)`)
}
