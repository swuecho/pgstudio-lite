import type { ExecutedQueryInfo } from '@/lib/notebook-params'

export type QueryResult = {
  connectionName?: string
  ranAt?: string
  rowLimit?: number
  statements: Array<{
    command: string
    rowCount: number
    returnedRowCount: number
    truncated: boolean
    fields: string[]
    rows: Record<string, unknown>[]
    tableTarget?: { schema: string; table: string } | null
    tableTargetPrimaryKey?: string[]
  }>
  totalRows: number
  durationMs: number
  /** Notebook cells only: the compiled SQL and bound `{{key}}` values Postgres actually received. */
  executedQuery?: ExecutedQueryInfo
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
  connection_name: string
  created_at: string
  updated_at: string
}

export type Connection = { id?: string; name: string; isDefault?: boolean; readOnly?: boolean }

export type QueryTab = {
  connectionName?: string
  rowLimit?: number
  id: string
  title: string
  query: string
  dirty: boolean
  snippetId?: string
  snippetConnectionName?: string
}

import type { RelationKind } from '@/lib/relation-kind'

export type { RelationKind }

export type SchemaTable = {
  schema: string
  table: string
  estimatedRows: number
  kind: RelationKind
}
