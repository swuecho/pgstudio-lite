import { useEffect } from 'react'
import { useSettingsPanelStore, type SettingsSection } from '../shared/stores/settingsPanelStore'
import { ConnectionsSection } from './sections/ConnectionsSection'
import { AppearanceSection } from './sections/AppearanceSection'
import styles from './SettingsPanel.module.css'

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'connections', label: 'Connections' },
  { id: 'appearance', label: 'Appearance' },
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

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div className={styles.panel}>
        <div className={styles.head}>
          <div className="nav-title">Settings</div>
          <button className="btn small" onClick={close}>
            Close
          </button>
        </div>
        <div className={styles.tabs} role="tablist">
          {SECTIONS.map((section) => (
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
        <div className={styles.body}>
          {activeSection === 'connections' ? <ConnectionsSection /> : null}
          {activeSection === 'appearance' ? <AppearanceSection /> : null}
        </div>
      </div>
    </div>
  )
}
