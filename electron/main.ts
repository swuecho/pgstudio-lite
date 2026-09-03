import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { ensureMetaDbReady } from '@/lib/meta-db'
import { startNotebookScheduler } from '@/lib/notebook-scheduler'
import { buildAppMenu } from './menu'
import { installShutdownHandlers } from './lifecycle'
import { installRuntimePaths } from './paths'
import { APP_ORIGIN, APP_SCHEME, registerAppProtocol, registerAppScheme } from './protocol'
import { runCapture } from './capture'
import { runSmokeChecks } from './smoke'
import { restoreWindowState, trackWindowState } from './window-state'

// Must happen at module scope, before the app is ready.
app.setName('PgStudio Lite')

/**
 * `--smoke` and `--capture` write to the metadata DB, so give them a throwaway
 * profile rather than the user's real one. Some app state (like the last
 * connection) cannot be removed through the API by design — `deleteConnection`
 * refuses to delete the last one — so isolation is the only clean option.
 */
const isolatedProfileIndex = process.argv.indexOf('--user-data-dir')
if (isolatedProfileIndex !== -1) {
  app.setPath('userData', resolve(process.argv[isolatedProfileIndex + 1]))
} else if (process.argv.includes('--smoke') || process.argv.includes('--capture')) {
  app.setPath('userData', join(tmpdir(), `pgstudio-desktop-${process.pid}`))
}

registerAppScheme()

/**
 * Two instances writing the same SQLite WAL is a corruption risk, so a second
 * launch focuses the existing window instead.
 */
if (!app.requestSingleInstanceLock()) {
  app.exit(0)
} else {
  main()
}

function createWindow() {
  const window = new BrowserWindow({
    ...restoreWindowState(),
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'PgStudio Lite',
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: join(__dirname, 'preload.js'),
      devTools: !app.isPackaged || process.argv.includes('--devtools'),
    },
  })

  trackWindowState(window)
  const captureIndex = process.argv.indexOf('--capture')
  if (process.argv.includes('--smoke')) {
    runSmokeChecks(window)
  } else if (captureIndex !== -1) {
    window.webContents.once('did-finish-load', () => {
      void runCapture(window, process.argv[captureIndex + 1])
    })
  } else {
    window.once('ready-to-show', () => window.show())
  }

  // Nothing in this app should open a new window or navigate off-origin.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).protocol !== `${APP_SCHEME}:`) {
      event.preventDefault()
      void openExternal(url)
    }
  })

  // A blank window with an invisible console error is the worst failure mode in
  // a packaged app, so surface renderer messages to the main process log.
  window.webContents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 'warning') {
      console.error(`[renderer:${event.level}] ${event.message}`)
    }
  })

  void window.loadURL(`${APP_ORIGIN}/`)
  return window
}

/** Only ever hand http(s) URLs to the OS. */
async function openExternal(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      await shell.openExternal(parsed.toString())
    }
  } catch {
    // Not a URL we can open; ignore.
  }
}

function main() {
  installRuntimePaths()
  installShutdownHandlers()

  let window: BrowserWindow | null = null

  app.on('second-instance', () => {
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) window = createWindow()
  })

  app.whenReady().then(() => {
    // No remote content is loaded, so nothing legitimately needs camera, mic,
    // notifications or geolocation.
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))

    registerAppProtocol()

    ipcMain.handle('pgstudio:open-external', (_event, url: unknown) =>
      typeof url === 'string' ? openExternal(url) : undefined
    )

    Menu.setApplicationMenu(buildAppMenu())

    // Open (and migrate) the metadata DB eagerly so a failure is reported as a
    // dialog rather than as an empty window once the renderer starts fetching.
    try {
      ensureMetaDbReady()
    } catch (error) {
      dialog.showErrorBox(
        'PgStudio Lite could not start',
        [
          'Opening the local application database failed.',
          '',
          error instanceof Error ? (error.stack ?? error.message) : String(error),
        ].join('\n')
      )
      app.exit(1)
      return
    }

    // Scheduled notebook runs only happen while the app is open; there is no
    // background agent. Started here rather than at import so a DB failure
    // above never leaves a ticker running against a closed handle.
    startNotebookScheduler()

    window = createWindow()
  })
}
