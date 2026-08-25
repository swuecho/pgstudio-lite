import type { QueryResult } from '../sql-editor/types'
import type { NotebookCellType, Notebook } from '@/lib/notebook-types'
export type { NotebookCellType, Notebook } from '@/lib/notebook-types'

export type NotebookInputType =
  | 'text'
  | 'number'
  | 'date'
  | 'datetime-local'
  | 'checkbox'
  | 'select'
  | 'range'
  | 'multiselect'

export type NotebookInputOption = {
  label: string
  value: string
}

export type NotebookResolvedOptionsState = {
  options: NotebookInputOption[]
  loading: boolean
  error: string
  lastLoadedAt?: string
}

export type NotebookOptionSource = 'manual' | 'sql'

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
    optionSource?: NotebookOptionSource
    optionsQuery?: string
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
  defaultValue?: string | number | boolean | string[] | null
  required?: boolean
  placeholder?: string
  options?: NotebookInputOption[]
  optionsSource?: NotebookOptionSource
  optionsQuery?: string
  min?: number
  max?: number
  step?: number
  autoRun?: boolean
}

export type NotebookCellMetadata = NotebookWidgetMetadata | null

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
