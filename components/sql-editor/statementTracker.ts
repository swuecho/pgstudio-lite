import type * as Monaco from 'monaco-editor'
import { sqlStatementRanges, statementRangeAt, type StatementRange } from '@/lib/sql-statement-range'

export type StatementTrackerError = { message: string; offset?: number; query: string } | undefined

type MonacoApi = Pick<typeof Monaco, 'Range' | 'MarkerSeverity'> & {
  editor: Pick<typeof Monaco.editor, 'setModelMarkers'>
}

type Snapshot = {
  model: Monaco.editor.ITextModel
  versionId: number
  text: string
  ranges: StatementRange[]
}

const MARKER_OWNER = 'query-error'
const STATEMENT_CLASS = 'sql-current-statement'

/**
 * Keeps the current-statement highlight and the query-error marker in sync
 * with the editor.
 *
 * Typing fires a content change and a cursor move back to back, and each
 * used to rescan the whole document. Work is now coalesced into one pass per
 * microtask, the scan is cached per model version so cursor-only moves cost a
 * lookup, and Monaco is only touched when the highlight or marker changed.
 */
export function createStatementTracker(editor: Monaco.editor.IStandaloneCodeEditor, monaco: MonacoApi) {
  const decorations = editor.createDecorationsCollection()
  const disposables: Monaco.IDisposable[] = []
  let snapshot: Snapshot | null = null
  let error: StatementTrackerError
  let disposed = false
  let scheduled = false
  let highlightKey = ''
  let markerKey = ''

  function getSnapshot(model: Monaco.editor.ITextModel): Snapshot {
    const versionId = model.getVersionId()
    if (snapshot && snapshot.model === model && snapshot.versionId === versionId) return snapshot
    const text = model.getValue()
    snapshot = { model, versionId, text, ranges: sqlStatementRanges(text) }
    return snapshot
  }

  function updateHighlight(model: Monaco.editor.ITextModel, snap: Snapshot) {
    const position = editor.getPosition()
    const selection = editor.getSelection()
    const range =
      position && selection?.isEmpty()
        ? statementRangeAt(snap.ranges, model.getOffsetAt(position), snap.text.length)
        : null
    const key = range ? `${model.id}:${snap.versionId}:${range.start}-${range.end}` : ''
    if (key === highlightKey) return
    highlightKey = key
    decorations.set(
      range
        ? [
            {
              range: monaco.Range.fromPositions(
                model.getPositionAt(range.start),
                model.getPositionAt(range.end)
              ),
              options: { isWholeLine: true, className: STATEMENT_CLASS },
            },
          ]
        : []
    )
  }

  function updateMarker(model: Monaco.editor.ITextModel, snap: Snapshot) {
    const matches =
      error !== undefined && error.offset !== undefined && error.offset >= 0 && error.query === snap.text
    const key = matches ? `${model.id}:${snap.versionId}:${error!.offset}:${error!.message}` : `${model.id}:`
    if (key === markerKey) return
    markerKey = key
    if (!matches || !error) {
      monaco.editor.setModelMarkers(model, MARKER_OWNER, [])
      return
    }
    const point = model.getPositionAt(error.offset!)
    monaco.editor.setModelMarkers(model, MARKER_OWNER, [
      {
        message: error.message,
        severity: monaco.MarkerSeverity.Error,
        startLineNumber: point.lineNumber,
        startColumn: point.column,
        endLineNumber: point.lineNumber,
        endColumn: point.column + 1,
      },
    ])
  }

  function refresh() {
    scheduled = false
    if (disposed) return
    const model = editor.getModel()
    if (!model) return
    const snap = getSnapshot(model)
    updateHighlight(model, snap)
    updateMarker(model, snap)
  }

  function schedule() {
    if (scheduled || disposed) return
    scheduled = true
    queueMicrotask(refresh)
  }

  disposables.push(
    editor.onDidChangeCursorPosition(schedule),
    editor.onDidChangeModelContent(schedule),
    editor.onDidChangeModel(() => {
      // Highlight/marker keys embed the model id, so a swapped model recomputes both.
      schedule()
    })
  )
  refresh()

  return {
    /** Registers the latest query error; the marker refreshes on the next microtask. */
    setError(next: StatementTrackerError) {
      error = next
      schedule()
    },
    /** Forces a synchronous refresh (used right after mount). */
    refresh,
    dispose() {
      if (disposed) return
      disposed = true
      for (const disposable of disposables) disposable.dispose()
      decorations.clear()
    },
  }
}

export type StatementTracker = ReturnType<typeof createStatementTracker>
