import type { RelationKind } from '@/lib/relation-kind'

export type { RelationKind }

export type TableInfo = {
  table: string
  schema: string
  estimatedRows: number
  kind: RelationKind
}

export type ColumnForeignKey = {
  constraintName: string
  referencedSchema: string
  referencedTable: string
  referencedColumn: string
  constraintColumns: string[]
  constraintReferencedColumns: string[]
}

export type ColumnInfo = {
  name: string
  dataType: string
  isNullable: boolean
  isIdentity: boolean
  isPrimaryKey: boolean
  hasDefault?: boolean
  foreignKey?: ColumnForeignKey
}

export type RowKey = Record<string, unknown>

export type RowData = Record<string, unknown> & { _rowKey: RowKey | null }

export type Connection = { id?: string; name: string; isDefault?: boolean; readOnly?: boolean }
