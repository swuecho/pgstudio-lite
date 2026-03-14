import styles from './TabsBar.module.css'
import { QueryTab } from './types'

type SqlTabsBarProps = {
  queryTabs: QueryTab[]
  activeQueryTabId: string
  onSelectTab: (id: string) => void
  onRenameTab: (id: string) => void
  onCloseTab: (id: string) => void
}

export function SqlTabsBar({
  queryTabs,
  activeQueryTabId,
  onSelectTab,
  onRenameTab,
  onCloseTab,
}: SqlTabsBarProps) {
  return (
    <div className={styles.sqlTabsBar}>
      {queryTabs.map((tab) => (
        <div key={tab.id} className={`${styles.sqlTab} ${tab.id === activeQueryTabId ? styles.active : ''}`.trim()}>
          <button className={styles.sqlTabMain} onClick={() => onSelectTab(tab.id)} onDoubleClick={() => onRenameTab(tab.id)}>
            {tab.title}
            {tab.snippetId && tab.dirty ? (
              <span className={styles.tabUnsavedBadge}>Unsaved</span>
            ) : tab.dirty ? (
              '*'
            ) : (
              ''
            )}
          </button>
          <button className={styles.sqlTabClose} onClick={() => onCloseTab(tab.id)} aria-label={`Close ${tab.title}`}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
