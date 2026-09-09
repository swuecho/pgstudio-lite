import { formatUuidDisplay, looksLikeUuid } from '@/lib/format-uuid-display'
import { buildTableEditorHref } from '@/lib/table-editor-url'
import type { ColumnForeignKey } from './types'

export const FOREIGN_KEY_JUMP_HINT = '⌘/Ctrl+click to open the referenced row'

export function buildForeignKeyMatch(
  row: Record<string, unknown>,
  foreignKey: ColumnForeignKey
): Record<string, unknown> | null {
  const match: Record<string, unknown> = {}
  for (let index = 0; index < foreignKey.constraintColumns.length; index += 1) {
    const localColumn = foreignKey.constraintColumns[index]
    const referencedColumn = foreignKey.constraintReferencedColumns[index]
    const value = row[localColumn]
    if (value === null || value === undefined) return null
    match[referencedColumn] = value
  }
  return match
}

/**
 * Table-editor URL for the row a foreign key points at. The URL filter only
 * carries one column, so composite keys filter on the first referenced column.
 */
export function buildForeignKeyTableEditorHref(args: {
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

export function formatForeignKeyTarget(foreignKey: ColumnForeignKey) {
  const schemaPrefix =
    foreignKey.referencedSchema && foreignKey.referencedSchema !== 'public'
      ? `${foreignKey.referencedSchema}.`
      : ''
  return `${schemaPrefix}${foreignKey.referencedTable}`
}

export function formatForeignKeyHeaderTitle(foreignKey: ColumnForeignKey) {
  return `References ${formatForeignKeyTarget(foreignKey)} (${foreignKey.referencedColumn})`
}

export function formatCellDisplayValue(value: unknown, maxLength = 80) {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  const display = looksLikeUuid(text) ? formatUuidDisplay(text) : text
  if (display.length <= maxLength) return display
  return `${display.slice(0, maxLength - 1)}…`
}
