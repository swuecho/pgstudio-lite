import { useEffect, useState } from 'react'

type ThemeMode = 'light' | 'dark'

function resolveTheme(): ThemeMode {
  if (typeof document === 'undefined') return 'light'
  const current = document.documentElement.dataset.theme
  return current === 'dark' ? 'dark' : 'light'
}

function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem('pgstudio-theme', theme)
  } catch {
    // ignore localStorage failures
  }
  window.dispatchEvent(new Event('pgstudio:themechange'))
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>('light')

  useEffect(() => {
    setTheme(resolveTheme())
  }, [])

  const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light'

  return (
    <button
      className="btn icon-btn"
      type="button"
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      onClick={() => {
        applyTheme(nextTheme)
        setTheme(nextTheme)
      }}
    >
      {theme === 'light' ? (
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            d="M12 3.2a.8.8 0 0 1 .8.8v1.7a.8.8 0 0 1-1.6 0V4a.8.8 0 0 1 .8-.8Zm0 15.1a.8.8 0 0 1 .8.8v1.7a.8.8 0 1 1-1.6 0V19a.8.8 0 0 1 .8-.8ZM6.2 5.3a.8.8 0 0 1 1.1 0l1.2 1.2a.8.8 0 0 1-1.1 1.1L6.2 6.4a.8.8 0 0 1 0-1.1Zm9.3 9.3a.8.8 0 0 1 1.1 0l1.2 1.2a.8.8 0 0 1-1.1 1.1l-1.2-1.2a.8.8 0 0 1 0-1.1ZM3.2 12a.8.8 0 0 1 .8-.8h1.7a.8.8 0 1 1 0 1.6H4a.8.8 0 0 1-.8-.8Zm15.1 0a.8.8 0 0 1 .8-.8h1.7a.8.8 0 1 1 0 1.6H19a.8.8 0 0 1-.8-.8ZM6.2 18.8a.8.8 0 0 1 0-1.1l1.2-1.2a.8.8 0 1 1 1.1 1.1l-1.2 1.2a.8.8 0 0 1-1.1 0Zm9.3-9.3a.8.8 0 0 1 0-1.1l1.2-1.2a.8.8 0 0 1 1.1 1.1l-1.2 1.2a.8.8 0 0 1-1.1 0ZM12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"
            fill="currentColor"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            d="M14.8 3.6a.8.8 0 0 1 .6 1.1 7.3 7.3 0 0 0-.4 2.4A7.9 7.9 0 0 0 22.9 15a.8.8 0 0 1 .7 1.2A10 10 0 1 1 13.8 2.4c.4 0 .8.5.6 1ZM12.1 4a8.4 8.4 0 1 0 8.1 10.5 9.5 9.5 0 0 1-6.8-9.2c0-.4 0-.9.1-1.3a8 8 0 0 0-1.4 0Z"
            fill="currentColor"
          />
        </svg>
      )}
    </button>
  )
}
