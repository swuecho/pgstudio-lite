import { AppLink } from './navigation'
import { useEffect } from 'react'
import ThemeToggle from '@/components/theme-toggle'
import { GearIcon } from '@/components/settings/SettingsButton'
import { getDesktopBridge } from '@/lib/desktop-bridge'
import { useSettingsPanelStore } from './stores/settingsPanelStore'
import styles from './NavRail.module.css'

export type NavRailSection = 'sql' | 'table' | 'notebook' | 'activity'

type NavRailItem = {
  id: NavRailSection
  href: string
  /** Fits the 52px rail. */
  short: string
  /** What the abbreviation actually means — surfaced on hover and to AT. */
  label: string
}

const ITEMS: NavRailItem[] = [
  { id: 'sql', href: '/', short: 'SQL', label: 'SQL Editor' },
  { id: 'table', href: '/table-editor', short: 'TB', label: 'Table Editor' },
  { id: 'notebook', href: '/notebook', short: 'NB', label: 'Notebook' },
  { id: 'activity', href: '/activity', short: 'AC', label: 'Activity' },
]

type NavRailProps = {
  /**
   * The section being viewed, or undefined for pages reached contextually
   * (e.g. row trace) which belong to no rail destination.
   */
  active?: NavRailSection
}

/**
 * The single left rail for every page. Previously copy-pasted into five files
 * across two styling systems, with two-letter labels that carried no tooltip
 * or accessible name and an inert <button> standing in for the current page.
 */
export function NavRail({ active }: NavRailProps) {
  const openAppSettings = useSettingsPanelStore((s) => s.openAppSettings)

  // Desktop app menu: Settings… (Cmd+,). Every page renders the rail, so this is the one place to listen.
  useEffect(() => getDesktopBridge()?.onOpenSettings?.(openAppSettings), [openAppSettings])

  return (
    <aside className={styles.rail}>
      {ITEMS.map((item) => {
        const isActive = item.id === active
        return (
          <AppLink
            key={item.id}
            href={item.href}
            className={`${styles.railBtn} ${isActive ? styles.railBtnActive : ''}`}
            aria-current={isActive ? 'page' : undefined}
            aria-label={item.label}
            title={item.label}
          >
            {item.short}
          </AppLink>
        )
      })}
      <div className={styles.bottomSlot}>
        <ThemeToggle />
        <button
          type="button"
          className={`btn icon-btn ${styles.settingsBtn}`}
          aria-label="Settings"
          title="Settings"
          onClick={openAppSettings}
        >
          <GearIcon size={16} />
        </button>
      </div>
    </aside>
  )
}
