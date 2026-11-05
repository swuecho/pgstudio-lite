import { useEffect } from 'react'
import { useSettingsPanelStore, type SettingsSection } from '../shared/stores/settingsPanelStore'
import { ConnectionsSection } from './sections/ConnectionsSection'
import { AppearanceSection } from './sections/AppearanceSection'
import { DataSection } from './sections/DataSection'
import styles from './SettingsPanel.module.css'

/**
 * Two entry points share this panel: the header button next to the connection
 * picker manages connections only, and the gear at the bottom of the nav rail
 * (or Cmd+, on desktop) opens the app-wide settings.
 */
const APP_SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'data', label: 'Data' },
]

export function SettingsPanel() {
  const isOpen = useSettingsPanelStore((s) => s.isOpen)
  const activeSection = useSettingsPanelStore((s) => s.activeSection)
  const close = useSettingsPanelStore((s) => s.close)
  const setActiveSection = useSettingsPanelStore((s) => s.setActiveSection)

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, close])

  if (!isOpen) return null

  const isConnections = activeSection === 'connections'
  const title = isConnections ? 'Connections' : 'Settings'

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div className={styles.panel}>
        <div className={styles.head}>
          <div className="nav-title">{title}</div>
          <button className="btn small" onClick={close}>
            Close
          </button>
        </div>
        {isConnections ? null : (
          <div className={styles.tabs} role="tablist">
            {APP_SECTIONS.map((section) => (
              <button
                key={section.id}
                role="tab"
                aria-selected={activeSection === section.id}
                className={`${styles.tab} ${activeSection === section.id ? styles.tabActive : ''}`.trim()}
                onClick={() => setActiveSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </div>
        )}
        <div className={styles.body}>
          {activeSection === 'connections' ? <ConnectionsSection /> : null}
          {activeSection === 'appearance' ? <AppearanceSection /> : null}
          {activeSection === 'data' ? <DataSection /> : null}
        </div>
      </div>
    </div>
  )
}
