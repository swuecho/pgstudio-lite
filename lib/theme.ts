export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'pgstudio-theme'
export const THEME_CHANGE_EVENT = 'pgstudio:themechange'
export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

/**
 * The stored preference, defaulting to 'system' so a dark-OS user gets a dark
 * app before touching any control.
 */
export function readThemePreference(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'system'
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(DARK_MEDIA_QUERY).matches
}

export function resolveThemePreference(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return prefersDark() ? 'dark' : 'light'
  return preference
}

/** The theme currently painted, read off the attribute `_document` stamps. */
export function readResolvedTheme(): ResolvedTheme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function applyResolvedTheme(theme: ResolvedTheme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
}

/**
 * Persist a preference, repaint, and notify listeners (`useThemeMode`, and the
 * controls themselves, which live in several places in the layout).
 */
export function setThemePreference(preference: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Ignore localStorage failures; the in-page theme still updates.
  }
  applyResolvedTheme(resolveThemePreference(preference))
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
}

/**
 * Inlined in `<head>` by `_document` and run before first paint, so a dark
 * theme never flashes light. Kept dependency-free and self-contained on
 * purpose — it executes before any bundle loads.
 */
export function themeBootstrapScript() {
  return `try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var t=s==='light'||s==='dark'?s:(window.matchMedia&&window.matchMedia('${DARK_MEDIA_QUERY}').matches?'dark':'light');document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}`
}
