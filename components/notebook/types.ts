import type { QueryResult } from '../sql-editor/types'

export type NotebookInputType = 'text' | 'number' | 'date' | 'datetime-local' | 'checkbox' | 'select' | 'range' | 'multiselect'

export type NotebookInputOption = {
  label: string
  value: string
}

export type NotebookWidgetType =
  | 'text'
  | 'number'
  | 'date'
  | 'datetime-local'
  | 'checkbox'
  | 'select'
  | 'range'
  | 'multiselect'
  | 'radio-group'
  | 'date-range'
  | 'actions'
  | 'callout'

export type NotebookWidgetOption = {
  label: string
  value: string
  description?: string
}

export type NotebookWidgetDateRangeValue = {
  start: string
  end: string
}

export type NotebookWidgetMetadata = {
  widgetType: NotebookWidgetType
  key?: string
  label?: string
  helpText?: string
  autoRun?: boolean
  hidden?: boolean
  disabled?: boolean
  value?: string | number | boolean | string[] | null | NotebookWidgetDateRangeValue
  defaultValue?: string | number | boolean | string[] | null | NotebookWidgetDateRangeValue
  required?: boolean
  placeholder?: string
  options?: NotebookWidgetOption[]
  min?: number
  max?: number
  step?: number
  config?: {
    startKey?: string
    endKey?: string
    action?: 'run-all' | 'run-targets'
    targetCellIds?: string[]
    tone?: 'info' | 'success' | 'warning' | 'danger'
    title?: string
    body?: string
  }
}

export type NotebookInputCellMetadata = {
  key: string
  label: string
  inputType: NotebookInputType
  value: string | number | boolean | string[] | null
  required?: boolean
  placeholder?: string
  options?: NotebookInputOption[]
  min?: number
  max?: number
  step?: number
  autoRun?: boolean
}

export type NotebookCellType = 'sql' | 'markdown' | 'widget'
export type NotebookCellMetadata = NotebookWidgetMetadata | null

export type Notebook = {
  id: string
  title: string
  description: string
  metadata_json: Record<string, unknown>
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
  metadata_json: NotebookCellMetadata
  updated_at: string
}

export type NotebookDetail = {
  notebook: Notebook
  cells: NotebookCell[]
}

export type RunCellResponse = QueryResult

export type NotebookInputValues = Record<string, unknown>
