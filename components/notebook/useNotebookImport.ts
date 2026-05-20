import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HttpError } from '../../lib/http'
import {
  buildGeneratePrompt,
  buildNotebookExportCurl,
  buildNotebookImportCurl,
  buildNotebookImportFetch,
  buildNotebookPatchCurl,
  buildPatchPrompt,
  getJsonParseErrorHint,
  summarizeNotebookDiff,
  type NotebookDiffSummary,
} from '../../lib/notebook-ui'
import { exportNotebook, importNotebook, type NotebookSpecV1 } from '../../features/notebook/notebook.service'

type ValidationDetail = { path: string; message: string; code?: string }

const NOTEBOOKS_KEY = ['notebooks']

function toValidationDetails(error: unknown): ValidationDetail[] {
  if (!(error instanceof HttpError) || !Array.isArray(error.details)) return []
  return error.details
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      path: String((item as Record<string, unknown>).path || ''),
      message: String((item as Record<string, unknown>).message || ''),
      code:
        typeof (item as Record<string, unknown>).code === 'string'
          ? ((item as Record<string, unknown>).code as string)
          : undefined,
    }))
}

export function useNotebookImport(params: {
  activeNotebookId: string
  setActiveNotebookId: (id: string) => void
  flushPendingSaves: (reason?: string) => Promise<boolean>
  setStatus: (value: string) => void
}) {
  const { activeNotebookId, setActiveNotebookId, flushPendingSaves, setStatus } = params
  const queryClient = useQueryClient()

  const [showImportModal, setShowImportModal] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [importMode, setImportMode] = useState<'create' | 'replace' | 'upsert'>('create')
  const [importRawJson, setImportRawJson] = useState('')
  const [importErrorDetails, setImportErrorDetails] = useState<ValidationDetail[]>([])
  const [importValidationWarnings, setImportValidationWarnings] = useState<string[]>([])
  const [importValidationSnapshot, setImportValidationSnapshot] = useState<NotebookSpecV1 | null>(null)
  const [importParseHint, setImportParseHint] = useState<{
    message: string
    line: number | null
    column: number | null
  } | null>(null)
  const [importDiffSummary, setImportDiffSummary] = useState<NotebookDiffSummary | null>(null)
  const [promptTask, setPromptTask] = useState('')
  const [promptDbContext, setPromptDbContext] = useState('')
  const [promptStyle, setPromptStyle] = useState('')
  const [promptPatchTask, setPromptPatchTask] = useState('')

  useEffect(() => {
    setImportParseHint(null)
    setImportErrorDetails([])
    setImportValidationSnapshot(null)
    setImportValidationWarnings([])
    setImportDiffSummary(null)
  }, [importRawJson, importMode])

  const importNotebookMutation = useMutation({
    mutationFn: (payload: {
      mode: 'create' | 'replace' | 'upsert'
      notebook: NotebookSpecV1
      target_notebook_id?: string
    }) => importNotebook(payload),
    onSuccess: (result) => {
      setStatus(
        result.warnings.length ? `Imported with warnings (${result.warnings.length})` : 'Notebook imported'
      )
      setActiveNotebookId(result.notebook_id)
      setShowImportModal(false)
      setImportRawJson('')
      setImportErrorDetails([])
      setImportValidationWarnings([])
      setImportValidationSnapshot(null)
      setImportParseHint(null)
      setImportDiffSummary(null)
      void queryClient.invalidateQueries({ queryKey: NOTEBOOKS_KEY })
      void queryClient.invalidateQueries({ queryKey: ['notebook', result.notebook_id] })
    },
    onError: (error) => {
      setStatus(error instanceof Error ? error.message : String(error))
      setImportErrorDetails(toValidationDetails(error))
    },
  })

  const validateImportMutation = useMutation({
    mutationFn: (payload: {
      mode: 'create' | 'replace' | 'upsert'
      notebook: NotebookSpecV1
      target_notebook_id?: string
    }) => importNotebook({ ...payload, validate_only: true }),
    onSuccess: (result) => {
      setImportValidationWarnings(result.warnings)
      setImportValidationSnapshot(result.notebook)
      setImportErrorDetails([])
      setStatus('Validation passed')
    },
    onError: (error) => {
      setStatus(error instanceof Error ? error.message : String(error))
      setImportErrorDetails(toValidationDetails(error))
      setImportValidationSnapshot(null)
      setImportValidationWarnings([])
    },
  })

  function parseImportDraft() {
    try {
      const parsed = JSON.parse(importRawJson) as NotebookSpecV1
      setImportParseHint(null)
      return parsed
    } catch (error) {
      setImportParseHint(getJsonParseErrorHint(error, importRawJson))
      setStatus('Invalid JSON in import payload')
      return null
    }
  }

  async function submitImportFromModal() {
    const parsed = parseImportDraft()
    if (!parsed) return
    if (importMode === 'replace' && !activeNotebookId) {
      setStatus('Select a notebook before using replace mode')
      return
    }
    if (!(await flushPendingSaves('import'))) {
      return
    }
    importNotebookMutation.mutate({
      mode: importMode,
      notebook: parsed,
      target_notebook_id: importMode === 'replace' ? activeNotebookId : undefined,
    })
  }

  function validateImportDraft() {
    const parsed = parseImportDraft()
    if (!parsed) return
    if (importMode === 'replace' && !activeNotebookId) {
      setStatus('Select a notebook before using replace mode')
      return
    }
    validateImportMutation.mutate({
      mode: importMode,
      notebook: parsed,
      target_notebook_id: importMode === 'replace' ? activeNotebookId : undefined,
    })
  }

  function previewImportDiff() {
    const parsed = parseImportDraft()
    if (!parsed) return
    if (!activeNotebookId) {
      setStatus('Select a notebook to compare against')
      setImportDiffSummary(null)
      return
    }
    void exportNotebook(activeNotebookId)
      .then((current) => {
        const summary = summarizeNotebookDiff(current, parsed)
        setImportDiffSummary(summary)
        setStatus('Diff preview ready')
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : String(error)))
  }

  function formatImportJson() {
    const parsed = parseImportDraft()
    if (!parsed) return
    setImportRawJson(`${JSON.stringify(parsed, null, 2)}\n`)
    setStatus('JSON formatted')
  }

  function pasteImportJsonFromClipboard() {
    void navigator.clipboard
      .readText()
      .then((text) => {
        setImportRawJson(text)
        setStatus('Pasted from clipboard')
      })
      .catch(() => setStatus('Clipboard paste failed'))
  }

  function loadCurrentNotebookJson() {
    if (!activeNotebookId) {
      setStatus('Select a notebook first')
      return
    }
    void exportNotebook(activeNotebookId)
      .then((notebook) => {
        setImportRawJson(`${JSON.stringify(notebook, null, 2)}\n`)
        setStatus('Loaded current notebook JSON')
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : String(error)))
  }

  function copyTextToClipboard(text: string, successLabel: string) {
    void navigator.clipboard
      .writeText(text)
      .then(() => setStatus(successLabel))
      .catch(() => setStatus('Clipboard copy failed'))
  }

  function copyGeneratePrompt() {
    const prompt = buildGeneratePrompt({ task: promptTask, dbContext: promptDbContext, style: promptStyle })
    copyTextToClipboard(prompt, 'Generate prompt copied')
  }

  function copyPatchPromptPrefilled() {
    if (!activeNotebookId) {
      const prompt = buildPatchPrompt({
        patchTask: promptPatchTask,
        currentNotebookJson: '(no active notebook selected)',
      })
      copyTextToClipboard(prompt, 'Patch prompt copied')
      return
    }
    void exportNotebook(activeNotebookId)
      .then((current) => {
        const prompt = buildPatchPrompt({
          patchTask: promptPatchTask,
          currentNotebookJson: JSON.stringify(current, null, 2),
        })
        copyTextToClipboard(prompt, 'Patch prompt copied')
      })
      .catch(() => {
        const prompt = buildPatchPrompt({
          patchTask: promptPatchTask,
          currentNotebookJson: '(failed to load current notebook)',
        })
        copyTextToClipboard(prompt, 'Patch prompt copied')
      })
  }

  function copyHelpApiSnippet(kind: 'curl-import' | 'curl-export' | 'curl-patch' | 'fetch-import') {
    if (kind === 'curl-export') {
      if (!activeNotebookId) {
        setStatus('Select a notebook first')
        return
      }
      copyTextToClipboard(buildNotebookExportCurl(activeNotebookId), 'Export cURL copied')
      return
    }

    if (kind === 'curl-patch') {
      if (!activeNotebookId) {
        setStatus('Select a notebook first')
        return
      }
      copyTextToClipboard(
        buildNotebookPatchCurl(
          activeNotebookId,
          JSON.stringify(
            {
              spec_version: '1.0',
              ops: [{ op: 'replace', path: '/title', value: 'Updated notebook title' }],
            },
            null,
            2
          )
        ),
        'Patch cURL copied'
      )
      return
    }

    if (kind === 'fetch-import') {
      copyTextToClipboard(
        buildNotebookImportFetch(`{
  mode: 'create',
  notebook: {
    spec_version: '1.0',
    title: 'Notebook title',
    description: 'Notebook description',
    connection_name: 'default',
    metadata: { source: 'codex' },
    cells: [{ id: 'md_intro', type: 'markdown', content: '# Intro' }]
  }
}`),
        'Import fetch copied'
      )
      return
    }

    copyTextToClipboard(
      buildNotebookImportCurl(
        JSON.stringify(
          {
            mode: 'create',
            notebook: {
              spec_version: '1.0',
              title: 'Notebook title',
              description: 'Notebook description',
              connection_name: 'default',
              metadata: { source: 'codex' },
              cells: [{ id: 'md_intro', type: 'markdown', content: '# Intro' }],
            },
          },
          null,
          2
        )
      ),
      'Import cURL copied'
    )
  }

  function exportNotebookJson() {
    if (!activeNotebookId) return
    void exportNotebook(activeNotebookId)
      .then((notebook) => {
        const text = `${JSON.stringify(notebook, null, 2)}\n`
        const blob = new Blob([text], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        const safeTitle = (notebook.title || 'notebook')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
        link.href = url
        link.download = `${safeTitle || 'notebook'}-${notebook.id || activeNotebookId}.json`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        setStatus('Notebook exported')
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : String(error)))
  }

  return {
    showImportModal,
    setShowImportModal,
    showHelp,
    setShowHelp,
    importMode,
    setImportMode,
    importRawJson,
    setImportRawJson,
    importErrorDetails,
    importValidationWarnings,
    importValidationSnapshot,
    importParseHint,
    importDiffSummary,
    promptTask,
    setPromptTask,
    promptDbContext,
    setPromptDbContext,
    promptStyle,
    setPromptStyle,
    promptPatchTask,
    setPromptPatchTask,
    isImporting: importNotebookMutation.isPending,
    isValidating: validateImportMutation.isPending,
    submitImportFromModal,
    validateImportDraft,
    previewImportDiff,
    formatImportJson,
    pasteImportJsonFromClipboard,
    loadCurrentNotebookJson,
    copyGeneratePrompt,
    copyPatchPromptPrefilled,
    copyHelpApiSnippet,
    exportNotebookJson,
  }
}
