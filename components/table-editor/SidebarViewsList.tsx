import { useState } from 'react'
import {
  formatRelativeTime,
  formatViewLabel,
  isSameView,
  viewStateKey,
  type TableEditorBookmark,
  type TableEditorRecentView,
  type TableEditorViewState,
} from '@/lib/table-editor-views'
import styles from './TableEditorStyles.module.css'

type SidebarViewsListProps = {
  currentView: TableEditorViewState | null
  viewsSearch: string
  /** Already filtered by `viewsSearch`. */
  pinnedBookmarks: TableEditorBookmark[]
  bookmarks: TableEditorBookmark[]
  recentViews: TableEditorRecentView[]
  onNavigateToView: (view: TableEditorViewState) => void
  onRenameBookmark: (id: string, title: string) => void | Promise<void>
  onToggleBookmarkPinned: (id: string) => void | Promise<void>
  onDeleteBookmark: (id: string) => void | Promise<void>
}

/** The Views tab: pinned bookmarks, bookmarks, and recent views, with inline rename. */
export function SidebarViewsList({
  currentView,
  viewsSearch,
  pinnedBookmarks,
  bookmarks,
  recentViews,
  onNavigateToView,
  onRenameBookmark,
  onToggleBookmarkPinned,
  onDeleteBookmark,
}: SidebarViewsListProps) {
  // Only one bookmark renames at a time; starting another implicitly cancels the first.
  const [renamingBookmarkId, setRenamingBookmarkId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const matchCount = pinnedBookmarks.length + bookmarks.length + recentViews.length
  if (matchCount === 0) {
    return (
      <div className="empty-state">
        {viewsSearch.trim()
          ? 'No views match your search.'
          : 'No saved or recent views yet. Open a table or filter, then use Save view.'}
      </div>
    )
  }

  const renderBookmark = (bookmark: TableEditorBookmark) => (
    <SidebarViewItem
      key={bookmark.id}
      view={bookmark}
      isActive={currentView ? isSameView(currentView, bookmark) : false}
      title={bookmark.title}
      subtitle={formatViewLabel(bookmark)}
      timestamp={formatRelativeTime(bookmark.createdAt)}
      bookmark={bookmark}
      renaming={renamingBookmarkId === bookmark.id}
      renameDraft={renameDraft}
      onNavigate={() => onNavigateToView(bookmark)}
      onRenameDraftChange={setRenameDraft}
      onStartRename={() => {
        setRenamingBookmarkId(bookmark.id)
        setRenameDraft(bookmark.title)
      }}
      onApplyRename={() => {
        void onRenameBookmark(bookmark.id, renameDraft)
        setRenamingBookmarkId(null)
      }}
      onCancelRename={() => setRenamingBookmarkId(null)}
      onTogglePinned={() => void onToggleBookmarkPinned(bookmark.id)}
      onDelete={() => void onDeleteBookmark(bookmark.id)}
    />
  )

  return (
    <>
      {pinnedBookmarks.length > 0 ? (
        <div className={styles.viewSection}>
          <div className={styles.viewSectionLabel}>Pinned</div>
          {pinnedBookmarks.map(renderBookmark)}
        </div>
      ) : null}
      {bookmarks.length > 0 ? (
        <div className={styles.viewSection}>
          <div className={styles.viewSectionLabel}>Bookmarks</div>
          {bookmarks.map(renderBookmark)}
        </div>
      ) : null}
      {recentViews.length > 0 ? (
        <div className={styles.viewSection}>
          <div className={styles.viewSectionLabel}>Recent</div>
          {recentViews.map((view) => (
            <SidebarViewItem
              key={viewStateKey(view)}
              view={view}
              isActive={currentView ? isSameView(currentView, view) : false}
              timestamp={formatRelativeTime(view.visitedAt)}
              onNavigate={() => onNavigateToView(view)}
            />
          ))}
        </div>
      ) : null}
    </>
  )
}

type SidebarViewItemProps = {
  view: TableEditorViewState
  isActive: boolean
  title?: string
  subtitle?: string
  timestamp?: string
  onNavigate: () => void
  /** Present for bookmarks only; recent views have no actions. */
  bookmark?: TableEditorBookmark
  renaming?: boolean
  renameDraft?: string
  onRenameDraftChange?: (value: string) => void
  onStartRename?: () => void
  onApplyRename?: () => void
  onCancelRename?: () => void
  onTogglePinned?: () => void
  onDelete?: () => void
}

function SidebarViewItem({
  view,
  isActive,
  title,
  subtitle,
  timestamp,
  onNavigate,
  bookmark,
  renaming = false,
  renameDraft = '',
  onRenameDraftChange,
  onStartRename,
  onApplyRename,
  onCancelRename,
  onTogglePinned,
  onDelete,
}: SidebarViewItemProps) {
  return (
    <div
      className={`history-item ${styles.viewItem} ${isActive ? styles.viewItemActive : ''}`}
      role="button"
      tabIndex={0}
      onClick={onNavigate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onNavigate()
        }
      }}
    >
      <div className={styles.viewItemTop}>
        <span className={`pill ${bookmark ? 'ok' : ''}`.trim()}>{bookmark ? 'bookmark' : 'recent'}</span>
        {bookmark && renaming ? (
          <input
            className={styles.viewTitleInput}
            value={renameDraft}
            autoFocus
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onRenameDraftChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onApplyRename?.()
              }
              if (event.key === 'Escape') onCancelRename?.()
            }}
            onBlur={() => onApplyRename?.()}
          />
        ) : (
          <span className={styles.viewItemTitle}>{title ?? formatViewLabel(view)}</span>
        )}
      </div>
      <div className={styles.viewItemQuery}>{subtitle ?? formatViewLabel(view)}</div>
      {timestamp ? <div className="history-meta">{timestamp}</div> : null}
      {bookmark ? (
        <div className="history-actions">
          <button
            className="btn small"
            onClick={(event) => {
              event.stopPropagation()
              onTogglePinned?.()
            }}
          >
            {bookmark.pinned ? 'Unpin' : 'Pin'}
          </button>
          {renaming ? (
            <button
              className="btn small"
              onClick={(event) => {
                event.stopPropagation()
                onApplyRename?.()
              }}
            >
              Apply
            </button>
          ) : (
            <button
              className="btn small"
              onClick={(event) => {
                event.stopPropagation()
                onStartRename?.()
              }}
            >
              Rename
            </button>
          )}
          <button
            className="btn small danger"
            onClick={(event) => {
              event.stopPropagation()
              onDelete?.()
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  )
}
