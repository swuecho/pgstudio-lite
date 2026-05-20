import type { ColumnForeignKey } from './types'

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
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}
