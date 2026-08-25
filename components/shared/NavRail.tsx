import Link from 'next/link'
import ThemeToggle from '@/components/theme-toggle'
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
  return (
    <aside className={styles.rail}>
      {ITEMS.map((item) => {
        const isActive = item.id === active
        return (
          <Link
            key={item.id}
            href={item.href}
            className={`${styles.railBtn} ${isActive ? styles.railBtnActive : ''}`}
            aria-current={isActive ? 'page' : undefined}
            aria-label={item.label}
            title={item.label}
          >
            {item.short}
          </Link>
        )
      })}
      <div className={styles.themeSlot}>
        <ThemeToggle />
      </div>
    </aside>
  )
}
