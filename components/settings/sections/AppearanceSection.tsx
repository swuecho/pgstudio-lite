import { useEffect, useState } from 'react'
import {
  THEME_CHANGE_EVENT,
  type ThemePreference,
  readThemePreference,
  setThemePreference,
} from '@/lib/theme'

const OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

export function AppearanceSection() {
  const [preference, setPreference] = useState<ThemePreference>('system')

  useEffect(() => {
    const sync = () => setPreference(readThemePreference())
    sync()
    window.addEventListener(THEME_CHANGE_EVENT, sync)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync)
  }, [])

  return (
    <div className="modal-section">
      <div className="history-meta">Theme</div>
      <div className="history-actions" role="group" aria-label="Theme">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`btn small ${preference === option.value ? 'active-item' : ''}`}
            aria-pressed={preference === option.value}
            onClick={() => {
              setThemePreference(option.value)
              setPreference(option.value)
            }}
          >
            {option.label}
          </button>
        ))}
        <span className="modal-check">System follows your operating system setting.</span>
      </div>
    </div>
  )
}
