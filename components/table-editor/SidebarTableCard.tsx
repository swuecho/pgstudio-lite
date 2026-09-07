import type { Ref } from 'react'
import { RelationKindBadge } from '../shared/RelationKindBadge'
import { formatRowCountLabel, ROW_COUNT_TOOLTIP } from '@/lib/table-editor-nav'
import type { TableInfo } from './types'
import styles from './TableEditorStyles.module.css'

type SidebarTableCardProps = {
  table: TableInfo
  /** `schema.table` */
  tableKey: string
  isActive: boolean
  isPinned: boolean
  showSchema: boolean
  onSelect: () => void
  onFocus: () => void
  onTogglePin: () => void
  ref: Ref<HTMLDivElement>
}

/** One row of the sidebar table list. */
export function SidebarTableCard({
  table,
  tableKey,
  isActive,
  isPinned,
  showSchema,
  onSelect,
  onFocus,
  onTogglePin,
  ref,
}: SidebarTableCardProps) {
  return (
    <div
      ref={ref}
      role="option"
      tabIndex={0}
      aria-selected={isActive}
      aria-current={isActive ? 'true' : undefined}
      className={`${styles.tableCard} ${isActive ? styles.tableCardActive : ''}`}
      onClick={onSelect}
      onFocus={onFocus}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
    >
      <div className={styles.tableCardHeader}>
        <div className={styles.tableCardNameRow}>
          <div className={styles.tableCardName} title={showSchema ? tableKey : table.table}>
            {showSchema ? (
              <>
                <span className={styles.tableCardSchema}>{table.schema}.</span>
                {table.table}
              </>
            ) : (
              table.table
            )}
          </div>
          <RelationKindBadge kind={table.kind} compact />
        </div>
        <div className={styles.tableCardActions}>
          <span className={styles.tableCardRows} title={ROW_COUNT_TOOLTIP}>
            {formatRowCountLabel(table.estimatedRows)}
          </span>
          <button
            type="button"
            className={`${styles.tableCardPin} ${isPinned ? styles.tableCardPinActive : ''}`}
            aria-label={isPinned ? `Unpin ${tableKey}` : `Pin ${tableKey}`}
            aria-pressed={isPinned}
            title={isPinned ? 'Unpin' : 'Pin'}
            onClick={(event) => {
              event.stopPropagation()
              onTogglePin()
            }}
          >
            {isPinned ? '★' : '☆'}
          </button>
        </div>
      </div>
    </div>
  )
}
