import { describe, expect, it, vi } from 'vitest'
import { createStatementTracker } from '@/components/sql-editor/statementTracker'

type Listener<T> = (event: T) => void

/** Minimal stand-in for a Monaco editor over a single-line model. */
function fakeEditor(initialText: string) {
  let text = initialText
  let versionId = 1
  let cursor = 1
  const listeners = { cursor: [] as Listener<unknown>[], content: [] as Listener<unknown>[] }
  const model = {
    id: 'model-1',
    getVersionId: () => versionId,
    getValue: vi.fn(() => text),
    getOffsetAt: (position: { column: number }) => position.column - 1,
    getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 }),
  }
  const decorations = { set: vi.fn(), clear: vi.fn() }
  const editor = {
    getModel: () => model,
    getPosition: () => ({ lineNumber: 1, column: cursor }),
    getSelection: () => ({ isEmpty: () => true }),
    createDecorationsCollection: () => decorations,
    onDidChangeCursorPosition: (fn: Listener<unknown>) => {
      listeners.cursor.push(fn)
      return { dispose: vi.fn() }
    },
    onDidChangeModelContent: (fn: Listener<unknown>) => {
      listeners.content.push(fn)
      return { dispose: vi.fn() }
    },
    onDidChangeModel: () => ({ dispose: vi.fn() }),
  }
  const monaco = {
    Range: { fromPositions: (start: unknown, end: unknown) => ({ start, end }) },
    MarkerSeverity: { Error: 8 },
    editor: { setModelMarkers: vi.fn() },
  }
  return {
    editor,
    monaco,
    model,
    decorations,
    moveCursor(column: number) {
      cursor = column
      listeners.cursor.forEach((fn) => fn({}))
    },
    type(insert: string) {
      text = text.slice(0, cursor - 1) + insert + text.slice(cursor - 1)
      versionId += 1
      cursor += insert.length
      listeners.content.forEach((fn) => fn({}))
      listeners.cursor.forEach((fn) => fn({}))
    },
  }
}

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve))

describe('statement tracker', () => {
  it('coalesces the content and cursor events of one keystroke into a single rescan', async () => {
    const fake = fakeEditor('select 1; select 2;')
    createStatementTracker(fake.editor as any, fake.monaco as any)
    expect(fake.model.getValue).toHaveBeenCalledTimes(1)
    expect(fake.decorations.set).toHaveBeenCalledTimes(1)

    fake.type('x')
    await flush()
    expect(fake.model.getValue).toHaveBeenCalledTimes(2)
    expect(fake.decorations.set).toHaveBeenCalledTimes(2)
  })

  it('does not rescan or redraw when the cursor moves within the same statement', async () => {
    const fake = fakeEditor('select 1; select 2;')
    createStatementTracker(fake.editor as any, fake.monaco as any)
    fake.moveCursor(3)
    fake.moveCursor(5)
    await flush()
    expect(fake.model.getValue).toHaveBeenCalledTimes(1)
    expect(fake.decorations.set).toHaveBeenCalledTimes(1)

    fake.moveCursor(12)
    await flush()
    expect(fake.decorations.set).toHaveBeenCalledTimes(2)
    const [decoration] = fake.decorations.set.mock.calls[1][0]
    expect(decoration.range).toEqual({
      start: { lineNumber: 1, column: 10 },
      end: { lineNumber: 1, column: 20 },
    })
  })

  it('shows the error marker only while the text still matches the failed query', async () => {
    const fake = fakeEditor('select 1; select 2;')
    const tracker = createStatementTracker(fake.editor as any, fake.monaco as any)
    tracker.setError({ message: 'boom', offset: 10, query: 'select 1; select 2;' })
    await flush()
    const markers = fake.monaco.editor.setModelMarkers
    expect(markers).toHaveBeenLastCalledWith(fake.model, 'query-error', [
      expect.objectContaining({ message: 'boom', startColumn: 11, endColumn: 12 }),
    ])

    fake.type(' ')
    await flush()
    expect(markers).toHaveBeenLastCalledWith(fake.model, 'query-error', [])
    const callsAfterClear = markers.mock.calls.length

    fake.type(' ')
    await flush()
    expect(markers.mock.calls.length).toBe(callsAfterClear)
  })

  it('stops touching the editor once disposed', async () => {
    const fake = fakeEditor('select 1;')
    const tracker = createStatementTracker(fake.editor as any, fake.monaco as any)
    tracker.dispose()
    fake.type('x')
    await flush()
    expect(fake.decorations.set).toHaveBeenCalledTimes(1)
    expect(fake.decorations.clear).toHaveBeenCalledTimes(1)
  })
})
