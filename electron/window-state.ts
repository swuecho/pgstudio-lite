import { app, screen, type BrowserWindow, type Rectangle } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

type WindowState = Rectangle & { maximized?: boolean }

const DEFAULT_STATE: WindowState = { width: 1440, height: 900, x: 0, y: 0 }

function stateFile() {
  return join(app.getPath('userData'), 'window-state.json')
}

/** Discard saved bounds that no longer land on a connected display. */
function isOnSomeDisplay(state: WindowState) {
  return screen.getAllDisplays().some((display) => {
    const { x, y, width, height } = display.workArea
    return state.x >= x && state.y >= y && state.x < x + width && state.y < y + height
  })
}

export function restoreWindowState(): Partial<WindowState> {
  try {
    const raw = readFileSync(stateFile(), 'utf8')
    const parsed = JSON.parse(raw) as WindowState
    if (
      typeof parsed.width === 'number' &&
      typeof parsed.height === 'number' &&
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number' &&
      isOnSomeDisplay(parsed)
    ) {
      return parsed
    }
    return { width: parsed.width || DEFAULT_STATE.width, height: parsed.height || DEFAULT_STATE.height }
  } catch {
    // No saved state, or it is unreadable: fall back to a sensible default.
    return { width: DEFAULT_STATE.width, height: DEFAULT_STATE.height }
  }
}

export function trackWindowState(window: BrowserWindow) {
  const save = () => {
    try {
      const state: WindowState = { ...window.getNormalBounds(), maximized: window.isMaximized() }
      mkdirSync(dirname(stateFile()), { recursive: true })
      writeFileSync(stateFile(), JSON.stringify(state))
    } catch {
      // Window geometry is a convenience; never let it break shutdown.
    }
  }

  window.on('close', save)
  window.on('resized', save)
  window.on('moved', save)

  if (existsSync(stateFile())) {
    try {
      const parsed = JSON.parse(readFileSync(stateFile(), 'utf8')) as WindowState
      if (parsed.maximized) window.maximize()
    } catch {
      // ignore
    }
  }
}
