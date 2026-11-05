import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'

/** Asks the focused window's renderer to open the app-wide settings panel. */
function openSettings() {
  const target = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  target?.webContents.send('pgstudio:open-settings')
}

/**
 * A real menu is not cosmetic on macOS: without an Edit menu the standard
 * Cmd+C/V/X/A accelerators do not reach the focused control, which would break
 * copy/paste inside the Monaco editors.
 */
export function buildAppMenu() {
  const isMac = process.platform === 'darwin'
  const settingsItem: MenuItemConstructorOptions = {
    label: isMac ? 'Settings…' : 'Settings',
    accelerator: 'CmdOrCtrl+,',
    click: openSettings,
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              settingsItem,
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ] satisfies MenuItemConstructorOptions[])
      : ([
          { label: 'File', submenu: [settingsItem, { type: 'separator' }, { role: 'quit' }] },
        ] satisfies MenuItemConstructorOptions[])),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(app.isPackaged && !process.argv.includes('--devtools')
          ? []
          : ([{ role: 'toggleDevTools' }] satisfies MenuItemConstructorOptions[])),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ]

  return Menu.buildFromTemplate(template)
}
