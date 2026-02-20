import type { QueryResult } from '../sql-editor/types'

export type NotebookCellType = 'sql' | 'markdown'

export type Notebook = {
  id: string
  title: string
  connection_name: string
  created_at: string
  updated_at: string
}

export type NotebookCell = {
  id: string
  notebook_id: string
  position: number
  type: NotebookCellType
  content: string
  collapsed: boolean
  last_run_status: 'success' | 'error' | null
  last_run_at: string | null
  last_duration_ms: number | null
  last_row_count: number | null
  last_result_json: QueryResult | null
  last_error: string | null
  updated_at: string
}

export type NotebookDetail = {
  notebook: Notebook
  cells: NotebookCell[]
}

export type RunCellResponse = QueryResult
