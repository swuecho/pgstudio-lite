import { contextBridge, ipcRenderer } from 'electron'

/**
 * Intentionally tiny.
 *
 * All data access goes over `app://` through the protocol handler, so there is
 * no IPC surface for the database here — no generic `invoke`, no `ipcRenderer`
 * passthrough. Only app-level conveniences the web build cannot provide.
 */
contextBridge.exposeInMainWorld('pgstudioDesktop', {
  version: process.env.PGSTUDIO_APP_VERSION ?? null,
  openExternal: (url: string) => ipcRenderer.invoke('pgstudio:open-external', url),
})
