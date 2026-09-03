// Shared notebook type definitions — no runtime imports.
// Imported by both server-side lib/ and client-side features/ and components/.
import type { QueryResult } from '../components/sql-editor/types'

export type NotebookCellType = 'sql' | 'markdown' | 'widget'

export type Notebook = {
  id: string
  title: string
  description: string
  metadata_json: Record<string, unknown>
  connection_name: string
  created_at: string
  updated_at: string
}

export type NotebookSpecV1Cell = {
  id: string
  type: NotebookCellType
  position?: number
  collapsed?: boolean
  content: string
  metadata?: Record<string, unknown>
}

export type NotebookSpecV1 = {
  spec_version: '1.0'
  id?: string
  title: string
  description?: string
  connection_name?: string
  metadata?: Record<string, unknown>
  cells: NotebookSpecV1Cell[]
}

// ---- Runs and schedules -------------------------------------------------------

export type NotebookRunTrigger = 'manual' | 'scheduled'
export type NotebookRunStatus = 'running' | 'success' | 'error'

export type NotebookRunSummary = {
  id: string
  notebook_id: string
  trigger: NotebookRunTrigger
  status: NotebookRunStatus
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  cell_count: number
  error_count: number
  error: string | null
}

/** A cell as it was when the run happened; SQL cells also carry their outcome. */
export type NotebookRunSnapshotCell = {
  id: string
  position: number
  type: NotebookCellType
  content: string
  metadata: Record<string, unknown> | null
  status: 'success' | 'error' | 'skipped' | null
  duration_ms: number | null
  result: QueryResult | null
  error: string | null
}

export type NotebookRunDetail = NotebookRunSummary & {
  notebook_title: string
  connection_name: string
  input_values: Record<string, unknown>
  cells: NotebookRunSnapshotCell[]
}

export type NotebookSchedule = {
  notebook_id: string
  enabled: boolean
  interval_minutes: number
  next_run_at: string | null
  last_run_at: string | null
  last_run_id: string | null
  updated_at: string | null
}
