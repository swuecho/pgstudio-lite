import { app, BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP_ORIGIN } from './protocol'

/**
 * Dev-only screenshot pass, enabled with `--capture <dir>`. Loads each page in
 * turn and writes a PNG, so the desktop rendering can be eyeballed without
 * clicking through the app by hand.
 */
const PAGES = ['/', '/table-editor', '/notebook', '/activity', '/trace']

export async function runCapture(window: BrowserWindow, outputDir: string) {
  mkdirSync(outputDir, { recursive: true })

  for (const route of PAGES) {
    await window.loadURL(`${APP_ORIGIN}${route}`)
    // Let the client-rendered shell settle (Monaco in particular mounts async).
    await new Promise((resolve) => setTimeout(resolve, 2500))
    const image = await window.webContents.capturePage()
    const name = route === '/' ? 'index' : route.replace(/^\//, '').replace(/\//g, '-')
    const file = join(outputDir, `${name}.png`)
    writeFileSync(file, image.toPNG())
    console.log(`captured ${route} -> ${file}`)
  }

  app.exit(0)
}
