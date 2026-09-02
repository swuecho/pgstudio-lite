/**
 * Rasterizes public/favicon.svg into build/icon.png at 1024x1024.
 *
 * There is no SVG rasterizer on a stock macOS (`sips` cannot read SVG), but
 * Electron already bundles Chromium, so use that. electron-builder converts the
 * PNG into the platform icon formats itself.
 *
 * Run via `npm run desktop:icon`, not directly.
 */
import { app, BrowserWindow } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 1024
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

app.disableHardwareAcceleration()

// Callback form rather than top-level await: in an ESM main entry, awaiting
// `app.whenReady()` at module scope deadlocks, because Electron does not emit
// `ready` until module evaluation has finished.
app.whenReady().then(async () => {
  const svg = readFileSync(join(repoRoot, 'public', 'favicon.svg'), 'utf8')
  const window = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    // Transparent so the icon's rounded corners are not boxed in white.
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })

  const html = `<!doctype html><meta charset="utf-8">
    <style>html,body{margin:0;padding:0;background:transparent;width:${SIZE}px;height:${SIZE}px;overflow:hidden}
    svg{display:block;width:${SIZE}px;height:${SIZE}px}</style>${svg}`

  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  // Give the compositor a frame to paint the SVG before capturing.
  await new Promise((resolve) => setTimeout(resolve, 600))

  const image = await window.webContents.capturePage()
  const outputDir = join(repoRoot, 'build')
  mkdirSync(outputDir, { recursive: true })
  const outputFile = join(outputDir, 'icon.png')
  writeFileSync(outputFile, image.resize({ width: SIZE, height: SIZE }).toPNG())
  console.log(`wrote ${outputFile} (${SIZE}x${SIZE})`)
  app.exit(0)
})
