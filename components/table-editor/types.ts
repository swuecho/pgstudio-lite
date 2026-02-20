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
}

export type RowData = Record<string, unknown> & { _ctid: string }

export type Connection = { id?: string; name: string; isDefault?: boolean }
