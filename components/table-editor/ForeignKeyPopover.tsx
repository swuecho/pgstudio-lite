import Link from 'next/link'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import { buildTableEditorHref } from '@/lib/table-editor-url'
import type { ColumnForeignKey, ColumnInfo } from './types'
import { formatCellDisplayValue, formatForeignKeyTarget } from './foreignKeyUtils'
import styles from './ForeignKeyPopover.module.css'
import { copyTextToClipboard } from '@/lib/clipboard'

const MAX_DISPLAY_COLUMNS = 8

type ForeignKeyPopoverProps = {
  anchorStyle: CSSProperties
  connectionName: string
  foreignKey: ColumnForeignKey
  cellValue: unknown
  match: Record<string, unknown>
  status: 'loading' | 'found' | 'not_found' | 'error'
  columns: ColumnInfo[]
  row: Record<string, unknown> | null
  errorMessage?: string
  onMouseEnter: () => void
  onMouseLeave: () => void
}

function buildForeignKeyTableEditorHref(args: {
  connectionName: string
  foreignKey: ColumnForeignKey
  match: Record<string, unknown>
}) {
  const { foreignKey, match, connectionName } = args
  const filterColumn = foreignKey.constraintReferencedColumns[0]
  return buildTableEditorHref({
    connectionName,
    schema: foreignKey.referencedSchema,
    table: foreignKey.referencedTable,
    filter: {
      filterColumn,
      filterValue: String(match[filterColumn] ?? ''),
      filterMode: 'equals',
      filterValueEnd: '',
    },
  })
}

export function ForeignKeyPopover({
  anchorStyle,
  connectionName,
  foreignKey,
  cellValue,
  match,
  status,
  columns,
  row,
  errorMessage,
  onMouseEnter,
  onMouseLeave,
}: ForeignKeyPopoverProps) {
  const displayColumns = columns.slice(0, MAX_DISPLAY_COLUMNS)
  const targetLabel = formatForeignKeyTarget(foreignKey)
  const tableEditorHref = buildForeignKeyTableEditorHref({ connectionName, foreignKey, match })

  async function copyValue() {
    const text = formatCellDisplayValue(cellValue, 10_000)
    if (!text) return
    await copyTextToClipboard(text)
  }

  return createPortal(
    <div
      className={styles.popover}
      style={anchorStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className={styles.header}>
        <span className={styles.title}>{targetLabel}</span>
      </div>
      <div className={styles.body}>
        {status === 'loading' ? (
          <p className={styles.message}>Loading…</p>
        ) : status === 'error' ? (
          <p className={styles.messageError}>{errorMessage || 'Failed to load referenced row'}</p>
        ) : status === 'not_found' ? (
          <p className={styles.message}>Referenced row not found</p>
        ) : row ? (
          <dl className={styles.fieldList}>
            {displayColumns.map((column) => (
              <div key={column.name} className={styles.field}>
                <dt>{column.name}</dt>
                <dd>{formatCellDisplayValue(row[column.name]) || '—'}</dd>
              </div>
            ))}
            {columns.length > MAX_DISPLAY_COLUMNS ? (
              <p className={styles.moreFields}>+{columns.length - MAX_DISPLAY_COLUMNS} more columns</p>
            ) : null}
          </dl>
        ) : (
          <p className={styles.message}>Referenced row not found</p>
        )}
      </div>
      <div className={styles.footer}>
        <Link className="btn small" href={tableEditorHref}>
          Open in Table Editor
        </Link>
        <button type="button" className="btn small" onClick={() => void copyValue()}>
          Copy value
        </button>
      </div>
    </div>,
    document.body
  )
}
