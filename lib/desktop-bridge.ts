/**
 * The `window.pgstudioDesktop` object exposed by `electron/preload.ts`. Absent
 * in the web build, so every caller has to treat it as optional.
 */
export type DesktopBridge = {
  version: string | null
  openExternal: (url: string) => Promise<void>
  /** Subscribes to the app menu's "Settings…" item (Cmd+,). Returns an unsubscribe function. */
  onOpenSettings?: (listener: () => void) => () => void
}

export function getDesktopBridge(): DesktopBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { pgstudioDesktop?: DesktopBridge }).pgstudioDesktop
}
