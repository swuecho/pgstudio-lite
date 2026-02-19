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
    <div className="sql-tabs-bar">
      {queryTabs.map((tab) => (
        <div key={tab.id} className={`sql-tab ${tab.id === activeQueryTabId ? 'active' : ''}`}>
          <button className="sql-tab-main" onClick={() => onSelectTab(tab.id)} onDoubleClick={() => onRenameTab(tab.id)}>
            {tab.title}
            {tab.snippetId && tab.dirty ? (
              <span className="tab-unsaved-badge">Unsaved</span>
            ) : tab.dirty ? (
              '*'
            ) : (
              ''
            )}
          </button>
          <button className="sql-tab-close" onClick={() => onCloseTab(tab.id)} aria-label={`Close ${tab.title}`}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
