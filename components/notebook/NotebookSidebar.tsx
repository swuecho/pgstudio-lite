import type { Notebook } from './types'
import styles from './NotebookPage.module.css'

type NotebookSidebarProps = {
  activeNotebookId: string
  handleWidthResizerMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void
  notebookSearch: string
  notebooks: Notebook[]
  onChangeNotebookSearch: (value: string) => void
  onCreateNotebook: () => void
  onDeleteNotebook: (item: Notebook) => void
  onRenameNotebook: (item: Notebook) => void
  onSelectNotebook: (id: string) => void
}

export function NotebookSidebar({
  activeNotebookId,
  handleWidthResizerMouseDown,
  notebookSearch,
  notebooks,
  onChangeNotebookSearch,
  onCreateNotebook,
  onDeleteNotebook,
  onRenameNotebook,
  onSelectNotebook,
}: NotebookSidebarProps) {
  const filteredNotebooks = notebooks.filter(
    (item) =>
      !notebookSearch.trim() ||
      item.title.toLowerCase().includes(notebookSearch.toLowerCase()) ||
      item.connection_name.toLowerCase().includes(notebookSearch.toLowerCase())
  )

  return (
    <aside className={styles.layoutNav}>
      <div className={styles.layoutNavHeader}>
        <div className={styles.navTitle}>Notebook</div>
      </div>

      <div className={styles.layoutNavControls}>
        <input
          placeholder="Search notebooks"
          value={notebookSearch}
          onChange={(e) => onChangeNotebookSearch(e.target.value)}
        />
        <button className="btn small" onClick={onCreateNotebook}>
          New
        </button>
      </div>

      <div className={styles.layoutNavList}>
        {filteredNotebooks.map((item) => (
          <button
            key={item.id}
            className={`${styles.historyItem} ${item.id === activeNotebookId ? styles.activeItem : ''}`}
            onClick={() => onSelectNotebook(item.id)}
          >
            <div className={styles.historyTop}>
              <span className="pill ok">Notebook</span>
              <span>{item.connection_name}</span>
            </div>
            <div className={styles.historyQuery}>{item.title}</div>
            <div className="history-actions">
              <button
                type="button"
                className="btn small"
                onClick={(event) => {
                  event.stopPropagation()
                  onRenameNotebook(item)
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className="btn small danger"
                onClick={(event) => {
                  event.stopPropagation()
                  onDeleteNotebook(item)
                }}
              >
                Delete
              </button>
            </div>
          </button>
        ))}
      </div>

      <div
        className={styles.widthResizer}
        onMouseDown={handleWidthResizerMouseDown}
        title="Drag to resize sidebar"
      />
    </aside>
  )
}
