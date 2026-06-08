import { useEffect, useState } from 'react'

export type ThemeMode = 'light' | 'dark'

function resolveTheme(): ThemeMode {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

/**
 * Tracks the active light/dark theme, staying in sync with the toggle that
 * writes `data-theme` on <html> and dispatches `pgstudio:themechange`.
 */
export function useThemeMode(): ThemeMode {
  const [theme, setTheme] = useState<ThemeMode>('light')

  useEffect(() => {
    const sync = () => setTheme(resolveTheme())
    sync()
    window.addEventListener('pgstudio:themechange', sync)
    return () => window.removeEventListener('pgstudio:themechange', sync)
  }, [])

  return theme
}
