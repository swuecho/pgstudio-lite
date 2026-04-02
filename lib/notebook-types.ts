// Shared notebook type definitions — no runtime imports.
// Imported by both server-side lib/ and client-side features/ and components/.

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
