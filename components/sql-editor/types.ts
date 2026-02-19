export type QueryResult = {
  statements: Array<{
    command: string
    rowCount: number
    fields: string[]
    rows: Record<string, unknown>[]
  }>
  totalRows: number
  durationMs: number
}

export type HistoryItem = {
  id: string
  query_text: string
  status: 'success' | 'error'
  duration_ms: number
  row_count: number | null
  executed_at: string
  connection_name: string
}

export type SnippetItem = {
  id: string
  title: string
  query_text: string
  created_at: string
  updated_at: string
}

export type Connection = { name: string }

export type QueryTab = {
  id: string
  title: string
  query: string
  dirty: boolean
  snippetId?: string
}

export type SchemaTable = {
  schema: string
  table: string
  estimatedRows: number
}
