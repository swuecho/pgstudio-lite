import { app, Menu, type MenuItemConstructorOptions } from 'electron'

/**
 * A real menu is not cosmetic on macOS: without an Edit menu the standard
 * Cmd+C/V/X/A accelerators do not reach the focused control, which would break
 * copy/paste inside the Monaco editors.
 */
export function buildAppMenu() {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([{ role: 'appMenu' }] satisfies MenuItemConstructorOptions[])
      : ([{ role: 'fileMenu' }] satisfies MenuItemConstructorOptions[])),
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
