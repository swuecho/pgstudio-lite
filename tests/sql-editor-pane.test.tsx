// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorPane } from '@/components/sql-editor/EditorPane'

/**
 * A small in-memory Monaco: models keyed by path, one editor that can swap
 * models, and the events EditorPane relies on. Shared with the mocked
 * `@monaco-editor/react` below via vi.hoisted.
 */
const fake = vi.hoisted(() => {
  type Listener = (event: any) => void
  const models = new Map<string, FakeModel>()
  const editors: FakeEditor[] = []
  let nextModelId = 1

  class FakeModel {
    id = `model-${nextModelId++}`
    private version = 1
    private contentListeners: Listener[] = []
    private willDisposeListeners: Listener[] = []
    disposed = false
    constructor(
      public uri: string,
      private text: string
    ) {}
    getValue() {
      return this.text
    }
    getVersionId() {
      return this.version
    }
    private lines() {
      return this.text.split('\n')
    }
    getLineCount() {
      return this.lines().length
    }
    getLinesContent() {
      return this.lines()
    }
    getOffsetAt(position: { lineNumber: number; column: number }) {
      const lines = this.lines()
      let offset = 0
      for (let i = 0; i < position.lineNumber - 1; i++) offset += lines[i].length + 1
      return offset + position.column - 1
    }
    getPositionAt(offset: number) {
      const lines = this.lines()
      let remaining = offset
      for (let i = 0; i < lines.length; i++) {
        if (remaining <= lines[i].length) return { lineNumber: i + 1, column: remaining + 1 }
        remaining -= lines[i].length + 1
      }
      const last = lines.length - 1
      return { lineNumber: last + 1, column: lines[last].length + 1 }
    }
    getFullModelRange() {
      const lines = this.lines()
      return {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: lines.length,
        endColumn: lines[lines.length - 1].length + 1,
      }
    }
    applyText(next: string) {
      this.text = next
      this.version += 1
      for (const listener of this.contentListeners) listener({})
    }
    onDidChangeContent(listener: Listener) {
      this.contentListeners.push(listener)
      return {
        dispose: () => {
          this.contentListeners = this.contentListeners.filter((item) => item !== listener)
        },
      }
    }
    onWillDispose(listener: Listener) {
      this.willDisposeListeners.push(listener)
      return {
        dispose: () => {
          this.willDisposeListeners = this.willDisposeListeners.filter((item) => item !== listener)
        },
      }
    }
    dispose() {
      for (const listener of this.willDisposeListeners) listener({})
      this.disposed = true
      models.delete(this.uri)
    }
  }

  class FakeEditor {
    private listeners = {
      content: [] as Listener[],
      model: [] as Listener[],
      cursorPosition: [] as Listener[],
      cursorSelection: [] as Listener[],
      dispose: [] as Listener[],
    }
    private forward: { dispose: () => void } | null = null
    commands = new Map<number, () => void>()
    decorations = { set: vi.fn(), clear: vi.fn() }
    disposed = false
    constructor(private model: FakeModel) {
      this.attach(model)
    }
    private attach(model: FakeModel) {
      this.forward?.dispose()
      this.forward = model.onDidChangeContent((event) => {
        for (const listener of this.listeners.content) listener(event)
      })
    }
    private on(kind: keyof FakeEditor['listeners']) {
      return (listener: Listener) => {
        this.listeners[kind].push(listener)
        return {
          dispose: () => {
            this.listeners[kind] = this.listeners[kind].filter((item) => item !== listener)
          },
        }
      }
    }
    getModel() {
      return this.disposed ? null : this.model
    }
    getValue() {
      return this.model.getValue()
    }
    getPosition() {
      return { lineNumber: 1, column: 1 }
    }
    getSelection() {
      return { isEmpty: () => true }
    }
    executeEdits(_source: string, edits: Array<{ text: string }>) {
      this.model.applyText(edits[0].text)
      return true
    }
    pushUndoStop() {}
    focus() {}
    createDecorationsCollection() {
      return this.decorations
    }
    addCommand(keybinding: number, handler: () => void) {
      this.commands.set(keybinding, handler)
      return 'command'
    }
    onDidChangeModelContent = this.on('content')
    onDidChangeModel = this.on('model')
    onDidChangeCursorPosition = this.on('cursorPosition')
    onDidChangeCursorSelection = this.on('cursorSelection')
    onDidDispose = this.on('dispose')
    setModel(next: FakeModel) {
      const previous = this.model
      this.model = next
      this.attach(next)
      for (const listener of this.listeners.model)
        listener({ oldModelUrl: previous.uri, newModelUrl: next.uri })
    }
    dispose() {
      this.disposed = true
      this.forward?.dispose()
      for (const listener of this.listeners.dispose) listener({})
    }
    // Test helpers
    type(text: string) {
      this.model.applyText(this.model.getValue() + text)
    }
    runCommand(keybinding: number) {
      this.commands.get(keybinding)!()
    }
    select(hasSelection: boolean) {
      for (const listener of this.listeners.cursorSelection)
        listener({ selection: { isEmpty: () => !hasSelection } })
    }
  }

  const monaco = {
    editor: {
      defineTheme: vi.fn(),
      setTheme: vi.fn(),
      setModelMarkers: vi.fn(),
      getModel: (uri: string) => models.get(uri) ?? null,
    },
    languages: {
      registerCompletionItemProvider: () => ({ dispose() {} }),
      CompletionItemKind: { Field: 1, Class: 2, Keyword: 3 },
    },
    KeyMod: { CtrlCmd: 2048, Shift: 1024 },
    KeyCode: { Enter: 3, KeyS: 49 },
    Range: { fromPositions: (start: unknown, end: unknown) => ({ start, end }) },
    MarkerSeverity: { Error: 8 },
  }

  function getOrCreateModel(path: string, initialText: string) {
    let model = models.get(path)
    if (!model) {
      model = new FakeModel(path, initialText)
      models.set(path, model)
    }
    return model
  }

  function createEditor(model: FakeModel) {
    const editor = new FakeEditor(model)
    editors.push(editor)
    return editor
  }

  function reset() {
    models.clear()
    editors.length = 0
  }

  return { models, editors, monaco, getOrCreateModel, createEditor, reset }
})

vi.mock('@monaco-editor/react', async () => {
  const React = await import('react')
  function FakeMonacoEditor({
    path,
    defaultValue,
    onMount,
  }: {
    path: string
    defaultValue: string
    onMount: (editor: unknown, monaco: unknown) => void
  }) {
    const editorRef = React.useRef<ReturnType<typeof fake.createEditor> | null>(null)
    const latest = React.useRef({ defaultValue, onMount })
    latest.current = { defaultValue, onMount }
    React.useEffect(() => {
      const editor = fake.createEditor(fake.getOrCreateModel(path, latest.current.defaultValue))
      editorRef.current = editor
      latest.current.onMount(editor, fake.monaco)
      return () => {
        // Mirrors @monaco-editor/react: the current model is disposed with the editor.
        editor.getModel()?.dispose()
        editor.dispose()
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    React.useEffect(() => {
      const editor = editorRef.current
      if (!editor) return
      const model = fake.getOrCreateModel(path, latest.current.defaultValue)
      if (model !== editor.getModel()) editor.setModel(model)
    }, [path])
    return React.createElement('div', { 'data-testid': 'fake-monaco' })
  }
  return { default: FakeMonacoEditor, loader: { config: vi.fn() } }
})

vi.mock('next/dynamic', async () => {
  const monacoReact = await import('@monaco-editor/react')
  return { default: () => monacoReact.default }
})

const DEBOUNCE_MS = 400
const CTRL_ENTER = 2048 | 3

function renderPane(overrides: Partial<React.ComponentProps<typeof EditorPane>> = {}) {
  const handlers = {
    onChangeValue: vi.fn(),
    onPersistTabQuery: vi.fn(),
    onMountEditor: vi.fn(),
    onSelectionChange: vi.fn(),
    onRunQuery: vi.fn(),
    onExplainQuery: vi.fn(),
    onSaveSnippet: vi.fn(),
    ensureColumnsForTable: vi.fn().mockResolvedValue([]),
  }
  const baseProps = {
    tabId: 'a',
    value: 'select 1;',
    schemaTablesRef: { current: [] },
    tableColumnsByKeyRef: { current: {} },
    ...handlers,
  }
  const utils = render(<EditorPane {...baseProps} {...overrides} />)
  const editor = () => fake.editors.at(-1)!
  return {
    ...utils,
    handlers,
    editor,
    rerenderWith(next: Partial<React.ComponentProps<typeof EditorPane>>) {
      utils.rerender(<EditorPane {...baseProps} {...overrides} {...next} />)
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  fake.reset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('EditorPane', () => {
  it('mounts one editor for the tab and reports it to the parent', () => {
    const pane = renderPane()
    expect(pane.handlers.onMountEditor).toHaveBeenCalledTimes(1)
    expect(pane.editor().getValue()).toBe('select 1;')
  })

  it('debounces edits into a single store update and ignores the echo', () => {
    const pane = renderPane()
    act(() => {
      pane.editor().type(' select')
      pane.editor().type(' 2;')
    })
    expect(pane.handlers.onChangeValue).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS)
    })
    expect(pane.handlers.onChangeValue).toHaveBeenCalledTimes(1)
    expect(pane.handlers.onChangeValue).toHaveBeenCalledWith('select 1; select 2;')

    // The store echoes the value back through props; that must not touch the editor.
    pane.rerenderWith({ value: 'select 1; select 2;' })
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS * 2)
    })
    expect(pane.handlers.onChangeValue).toHaveBeenCalledTimes(1)
    expect(pane.editor().getValue()).toBe('select 1; select 2;')
  })

  it('applies externally loaded SQL without persisting it back as an edit', () => {
    const pane = renderPane()
    pane.rerenderWith({ value: 'select 42;' })
    expect(pane.editor().getValue()).toBe('select 42;')
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS * 2)
    })
    expect(pane.handlers.onChangeValue).not.toHaveBeenCalled()
  })

  it('keeps each tab draft when switching tabs and only persists what changed', () => {
    const pane = renderPane()
    const editor = pane.editor()
    act(() => {
      editor.type(' -- edited')
    })

    pane.rerenderWith({ tabId: 'b', value: 'select b;' })
    expect(pane.handlers.onPersistTabQuery).toHaveBeenCalledTimes(1)
    expect(pane.handlers.onPersistTabQuery).toHaveBeenCalledWith('a', 'select 1; -- edited')
    expect(pane.handlers.onChangeValue).not.toHaveBeenCalled()
    expect(pane.editor()).toBe(editor)
    expect(editor.getValue()).toBe('select b;')
    expect(pane.handlers.onMountEditor).toHaveBeenCalledTimes(1)

    // Switching away from an untouched tab must not mark it dirty.
    pane.rerenderWith({ tabId: 'a', value: 'select 1; -- edited' })
    expect(pane.handlers.onPersistTabQuery).toHaveBeenCalledTimes(1)
    expect(editor.getValue()).toBe('select 1; -- edited')
    expect(fake.models.size).toBe(2)
  })

  it('flushes the draft before running with Ctrl/Cmd+Enter', () => {
    const pane = renderPane()
    act(() => {
      pane.editor().type(' select 2;')
      pane.editor().runCommand(CTRL_ENTER)
    })
    expect(pane.handlers.onChangeValue).toHaveBeenCalledWith('select 1; select 2;')
    expect(pane.handlers.onRunQuery).toHaveBeenCalledTimes(1)
    expect(pane.handlers.onChangeValue.mock.invocationCallOrder[0]).toBeLessThan(
      pane.handlers.onRunQuery.mock.invocationCallOrder[0]
    )
  })

  it('persists a pending draft when unmounted', () => {
    const pane = renderPane()
    act(() => {
      pane.editor().type(' select 3;')
    })
    pane.unmount()
    expect(pane.handlers.onChangeValue).toHaveBeenCalledWith('select 1; select 3;')
  })

  it('reports selection state only when it changes', () => {
    const pane = renderPane()
    act(() => {
      pane.editor().select(true)
      pane.editor().select(true)
      pane.editor().select(false)
    })
    expect(pane.handlers.onSelectionChange.mock.calls).toEqual([[true], [false]])
  })
})
