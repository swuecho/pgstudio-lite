import { fetchJson } from '@/lib/http'
import type { Connection } from '@/components/sql-editor/types'
import type { NotebookSpecV1 } from '@/lib/notebook-types'
import type {
  Notebook,
  NotebookCell,
  NotebookCellType,
  NotebookDetail,
  NotebookWidgetMetadata,
  NotebookInputValues,
  NotebookRunDetail,
  NotebookRunSummary,
  NotebookSchedule,
  RunCellResponse,
} from '@/components/notebook/types'

export type { NotebookSpecV1 }

export type ImportNotebookResponse = {
  ok: boolean
  notebook_id: string
  warnings: string[]
  notebook: NotebookSpecV1
}

export async function getConnections() {
  return fetchJson<{ connections: Connection[]; configured: boolean }>('/api/connections')
}

export async function getNotebooks(limit = 200) {
  return fetchJson<{ items: Notebook[] }>(`/api/notebooks?limit=${limit}`)
}

export async function createNotebook(title: string, connectionName?: string) {
  return fetchJson<{ item: Notebook }>('/api/notebooks', {
    method: 'POST',
    body: JSON.stringify({ title, connectionName }),
  })
}

export async function updateNotebook(id: string, payload: { title?: string; connectionName?: string }) {
  return fetchJson<{ item: Notebook }>('/api/notebooks', {
    method: 'PATCH',
    body: JSON.stringify({ id, ...payload }),
  })
}

export async function deleteNotebook(id: string) {
  return fetchJson<{ ok: boolean }>('/api/notebooks', {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  })
}

export async function getNotebook(id: string) {
  return fetchJson<NotebookDetail>(`/api/notebooks/${encodeURIComponent(id)}`)
}

export async function createCell(
  notebookId: string,
  payload: {
    type: NotebookCellType
    content?: string
    metadata?: NotebookWidgetMetadata | null
    position?: number
  }
) {
  return fetchJson<{ item: NotebookCell; cells: NotebookCell[] }>(
    `/api/notebooks/${encodeURIComponent(notebookId)}/cells`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )
}

export async function updateCell(
  notebookId: string,
  payload: {
    cellId: string
    type?: NotebookCellType
    content?: string
    metadata?: NotebookWidgetMetadata | null
    collapsed?: boolean
    position?: number
  }
) {
  return fetchJson<{ item: NotebookCell; cells: NotebookCell[] }>(
    `/api/notebooks/${encodeURIComponent(notebookId)}/cells`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  )
}

export async function deleteCell(notebookId: string, cellId: string) {
  return fetchJson<{ ok: boolean; cells: NotebookCell[] }>(
    `/api/notebooks/${encodeURIComponent(notebookId)}/cells`,
    {
      method: 'DELETE',
      body: JSON.stringify({ cellId }),
    }
  )
}

export async function runCell(
  notebookId: string,
  cellId: string,
  query: string,
  inputValues?: NotebookInputValues
) {
  const payload = inputValues ? { cellId, query, inputValues } : { cellId, query }
  return fetchJson<RunCellResponse>(`/api/notebooks/${encodeURIComponent(notebookId)}/run-cell`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function runOptionQuery(notebookId: string, query: string, inputValues?: NotebookInputValues) {
  const payload = inputValues ? { query, inputValues } : { query }
  return fetchJson<RunCellResponse>(`/api/notebooks/${encodeURIComponent(notebookId)}/option-query`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function importNotebook(payload: {
  mode?: 'create' | 'replace' | 'upsert'
  target_notebook_id?: string
  notebook: NotebookSpecV1
  validate_only?: boolean
}) {
  return fetchJson<ImportNotebookResponse>('/api/notebooks/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function generateTourNotebook(payload: {
  connectionName?: string
  schema?: string
  maxTables?: number
}) {
  const params = new URLSearchParams()
  if (payload.connectionName) params.set('connectionName', payload.connectionName)
  const suffix = params.toString() ? `?${params.toString()}` : ''
  return fetchJson<{ ok: boolean; notebook_id: string; cell_count: number }>(
    `/api/notebooks/generate-tour${suffix}`,
    {
      method: 'POST',
      body: JSON.stringify({ schema: payload.schema, maxTables: payload.maxTables }),
    }
  )
}

export async function exportNotebook(notebookId: string) {
  return fetchJson<NotebookSpecV1>(`/api/notebooks/${encodeURIComponent(notebookId)}/export`)
}

// ---- Runs and schedules -------------------------------------------------------

export async function listNotebookRuns(notebookId: string) {
  return fetchJson<{ items: NotebookRunSummary[] }>(`/api/notebooks/${encodeURIComponent(notebookId)}/runs`)
}

export async function getNotebookRun(notebookId: string, runId: string) {
  return fetchJson<{ item: NotebookRunDetail }>(
    `/api/notebooks/${encodeURIComponent(notebookId)}/runs/${encodeURIComponent(runId)}`
  )
}

/** Runs every SQL cell now and returns the stored run; resolves when the run has finished. */
export async function triggerNotebookRun(notebookId: string) {
  return fetchJson<{ item: NotebookRunDetail }>(`/api/notebooks/${encodeURIComponent(notebookId)}/runs`, {
    method: 'POST',
  })
}

export async function deleteNotebookRun(notebookId: string, runId: string) {
  return fetchJson<{ ok: boolean }>(
    `/api/notebooks/${encodeURIComponent(notebookId)}/runs/${encodeURIComponent(runId)}`,
    { method: 'DELETE' }
  )
}

export async function getNotebookSchedule(notebookId: string) {
  return fetchJson<{ item: NotebookSchedule }>(`/api/notebooks/${encodeURIComponent(notebookId)}/schedule`)
}

export async function updateNotebookSchedule(
  notebookId: string,
  payload: { enabled: boolean; intervalMinutes: number }
) {
  return fetchJson<{ item: NotebookSchedule }>(`/api/notebooks/${encodeURIComponent(notebookId)}/schedule`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}
