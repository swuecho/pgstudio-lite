export type TableInfo = {
  table: string
  schema: string
  estimatedRows: number
}

export type ColumnInfo = {
  name: string
  dataType: string
  isNullable: boolean
  isIdentity: boolean
  isPrimaryKey: boolean
}

export type RowKey = Record<string, unknown>

export type RowData = Record<string, unknown> & { _rowKey: RowKey | null }

export type Connection = { id?: string; name: string; isDefault?: boolean; readOnly?: boolean }
