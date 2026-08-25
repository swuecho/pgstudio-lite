import { useEffect, useState } from 'react'
import { THEME_CHANGE_EVENT, type ResolvedTheme, readResolvedTheme } from '@/lib/theme'

export type ThemeMode = ResolvedTheme

/**
 * Tracks the active light/dark theme, staying in sync with the controls that
 * write `data-theme` on <html> and dispatch `pgstudio:themechange`.
 */
export function useThemeMode(): ThemeMode {
  const [theme, setTheme] = useState<ThemeMode>('light')

  useEffect(() => {
    const sync = () => setTheme(readResolvedTheme())
    sync()
    window.addEventListener(THEME_CHANGE_EVENT, sync)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync)
  }, [])

  return theme
}
