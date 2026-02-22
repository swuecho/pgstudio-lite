import type { NotebookSpecV1 } from '../features/notebook/notebook.service'

const GENERATE_PROMPT_TEMPLATE = `You are generating a pgstudio-lite notebook document.

Return only valid JSON. Do not include markdown fences, prose, comments, or explanations.

Requirements:
- Output must follow notebook spec v1.
- Set "spec_version" to "1.0".
- Include top-level fields: spec_version, title, description, connection_name, metadata, cells.
- cells must be a non-empty array.
- Allowed cell types: markdown, input, sql.
- Every cell must have stable id, type, and content.
- input cells must include metadata with:
  - key matching ^[A-Za-z_][A-Za-z0-9_]*$
  - label, inputType, value
- SQL cells should use template params in {{param_key}} form when input cells exist.
- SQL content must not be empty.
- Keep cell IDs deterministic and readable (example: md_intro, input_start_date, sql_main_query).
- Put cells in intended execution order.
- Prefer safe, read-only SQL (SELECT ...) unless asked otherwise.

Task:
{{TASK_DESCRIPTION}}

Database context (if provided):
{{DB_CONTEXT}}

Notebook style preferences (if provided):
{{STYLE_PREFERENCES}}

Return JSON only.`

const PATCH_PROMPT_TEMPLATE = `You are updating an existing pgstudio-lite notebook.

Return only valid JSON. Do not include markdown fences, prose, comments, or explanations.

Requirements:
- Output must be a JSON object with:
  - "spec_version": "1.0"
  - "ops": RFC 6902 JSON Patch operations array
- Allowed patch operations: add, remove, replace
- Paths must be valid JSON Pointer paths against the exported notebook JSON.
- Keep existing cell IDs stable whenever possible.
- If adding new cells, use deterministic readable IDs (example: md_notes_q1, sql_top_customers_v2).
- If SQL uses parameters, ensure matching input keys exist.
- Prefer safe read-only SQL (SELECT ...) unless asked otherwise.

Current notebook JSON:
{{CURRENT_NOTEBOOK_JSON}}

Update request:
{{PATCH_TASK_DESCRIPTION}}

Return JSON only.`

function replaceToken(input: string, token: string, value: string) {
  return input.replaceAll(token, value.trim() || '(none)')
}

export function buildGeneratePrompt(input: { task: string; dbContext: string; style: string }) {
  let out = GENERATE_PROMPT_TEMPLATE
  out = replaceToken(out, '{{TASK_DESCRIPTION}}', input.task)
  out = replaceToken(out, '{{DB_CONTEXT}}', input.dbContext)
  out = replaceToken(out, '{{STYLE_PREFERENCES}}', input.style)
  return out
}

export function buildPatchPrompt(input: { patchTask: string; currentNotebookJson: string }) {
  let out = PATCH_PROMPT_TEMPLATE
  out = replaceToken(out, '{{PATCH_TASK_DESCRIPTION}}', input.patchTask)
  out = replaceToken(out, '{{CURRENT_NOTEBOOK_JSON}}', input.currentNotebookJson)
  return out
}

export type JsonParseErrorHint = {
  message: string
  line: number | null
  column: number | null
}

export function getJsonParseErrorHint(error: unknown, source: string): JsonParseErrorHint {
  const fallback = {
    message: error instanceof Error ? error.message : 'Invalid JSON',
    line: null,
    column: null,
  }
  const message = error instanceof Error ? error.message : String(error)
  const match = message.match(/position (\d+)/i)
  if (!match) return fallback
  const index = Number(match[1])
  if (!Number.isFinite(index) || index < 0) return fallback
  let line = 1
  let column = 1
  for (let i = 0; i < Math.min(index, source.length); i += 1) {
    if (source[i] === '\n') {
      line += 1
      column = 1
    } else {
      column += 1
    }
  }
  return { message, line, column }
}

export type NotebookDiffSummary = {
  titleChanged: boolean
  descriptionChanged: boolean
  connectionChanged: boolean
  metadataChanged: boolean
  addedCellIds: string[]
  removedCellIds: string[]
  reorderedCellCount: number
  changedCellContentIds: string[]
}

export function summarizeNotebookDiff(currentNotebook: NotebookSpecV1, incomingNotebook: NotebookSpecV1): NotebookDiffSummary {
  const currentCellIds = currentNotebook.cells.map((cell) => cell.id)
  const incomingCellIds = incomingNotebook.cells.map((cell) => cell.id)
  const currentById = new Map(currentNotebook.cells.map((cell) => [cell.id, cell]))
  const incomingById = new Map(incomingNotebook.cells.map((cell) => [cell.id, cell]))

  const addedCellIds = incomingCellIds.filter((id) => !currentById.has(id))
  const removedCellIds = currentCellIds.filter((id) => !incomingById.has(id))
  const commonIds = incomingCellIds.filter((id) => currentById.has(id))

  let reorderedCellCount = 0
  for (const id of commonIds) {
    const a = currentCellIds.indexOf(id)
    const b = incomingCellIds.indexOf(id)
    if (a !== b) reorderedCellCount += 1
  }

  const changedCellContentIds: string[] = []
  for (const id of commonIds) {
    const before = currentById.get(id)
    const after = incomingById.get(id)
    if (!before || !after) continue
    if (
      before.type !== after.type ||
      before.content !== after.content ||
      JSON.stringify(before.metadata || null) !== JSON.stringify(after.metadata || null) ||
      Boolean(before.collapsed) !== Boolean(after.collapsed)
    ) {
      changedCellContentIds.push(id)
    }
  }

  return {
    titleChanged: currentNotebook.title !== incomingNotebook.title,
    descriptionChanged: (currentNotebook.description || '') !== (incomingNotebook.description || ''),
    connectionChanged: (currentNotebook.connection_name || '') !== (incomingNotebook.connection_name || ''),
    metadataChanged:
      JSON.stringify(currentNotebook.metadata || {}) !== JSON.stringify(incomingNotebook.metadata || {}),
    addedCellIds,
    removedCellIds,
    reorderedCellCount,
    changedCellContentIds,
  }
}

export function buildNotebookImportCurl(payloadJson: string) {
  return `curl -X POST http://localhost:4180/api/notebooks/import \\
  -H "Content-Type: application/json" \\
  -d '${payloadJson.replaceAll("'", "'\\''")}'`
}

export function buildNotebookExportCurl(notebookId: string) {
  return `curl http://localhost:4180/api/notebooks/${encodeURIComponent(notebookId)}/export`
}

export function buildNotebookPatchCurl(notebookId: string, payloadJson: string) {
  return `curl -X POST http://localhost:4180/api/notebooks/${encodeURIComponent(notebookId)}/patch \\
  -H "Content-Type: application/json" \\
  -d '${payloadJson.replaceAll("'", "'\\''")}'`
}

export function buildNotebookImportFetch(payloadJson: string) {
  return `fetch('/api/notebooks/import', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(${payloadJson})
})`
}
