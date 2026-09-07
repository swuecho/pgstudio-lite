import dynamic from 'next/dynamic'
import { loader } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { memo, useEffect, useRef, type MutableRefObject } from 'react'
import { useLatestRef } from '@/hooks/useLatestRef'
import { SQL_EDITOR_LIGHT_THEME, defineSqlEditorThemes, sqlEditorThemeName } from './editorThemes'
import { registerSqlCompletionProvider } from './sqlCompletionProvider'
import { createStatementTracker, type StatementTracker } from './statementTracker'
import { getCurrentTheme } from './utils'
import type { SchemaTable } from './types'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

const QUERY_PERSIST_DELAY_MS = 400

/**
 * Module constant on purpose: `@monaco-editor/react` calls `editor.updateOptions`
 * whenever this object's identity changes, so an inline literal reconfigured
 * the editor on every render.
 */
const EDITOR_OPTIONS: Monaco.editor.IStandaloneEditorConstructionOptions = {
  tabSize: 2,
  fontSize: 13,
  minimap: { enabled: false },
  wordWrap: 'on',
  lineNumbers: 'on',
  lineNumbersMinChars: 3,
  scrollBeyondLastLine: false,
  automaticLayout: true,
}

if (typeof window !== 'undefined') {
  ;(window as any).MonacoEnvironment = {
    ...((window as any).MonacoEnvironment || {}),
    baseUrl: '/api/monaco/',
  }
}

loader.config({ paths: { vs: '/api/monaco' } })

/**
 * Each query tab owns a Monaco model. Switching tabs swaps the model on one
 * long-lived editor (keeping undo history, cursor and scroll per tab) instead
 * of tearing the editor down and rebuilding it.
 */
function tabModelPath(tabId: string) {
  return `inmemory://pgstudio-sql-tabs/${encodeURIComponent(tabId)}`
}

type EditorPaneProps = {
  queryError?: { message: string; offset?: number; query: string }
  tabId: string
  value: string
  onChangeValue: (value: string) => void
  onPersistTabQuery: (tabId: string, value: string) => void
  onMountEditor: (editor: Monaco.editor.IStandaloneCodeEditor) => void
  onSelectionChange: (hasSelection: boolean) => void
  onRunQuery: () => void
  onExplainQuery: () => void
  onSaveSnippet: () => void
  schemaTablesRef: MutableRefObject<SchemaTable[]>
  tableColumnsByKeyRef: MutableRefObject<Record<string, string[]>>
  ensureColumnsForTable: (schema: string, table: string) => Promise<string[]>
}

export const EditorPane = memo(function EditorPane(props: EditorPaneProps) {
  const { queryError, tabId, value, schemaTablesRef, tableColumnsByKeyRef } = props
  const latest = useLatestRef(props)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const trackerRef = useRef<StatementTracker | null>(null)
  /** Editor text for the mounted tab, refreshed from the editor whenever it is available. */
  const draftRef = useRef(value)
  /** The `value` prop currently applied to the editor (store copy of the draft). */
  const valueRef = useRef(value)
  /** Last draft handed to the parent, so its echo back through `value` is not treated as external. */
  const lastSentRef = useRef<string | null>(null)
  const tabIdRef = useRef(tabId)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const applyingExternalValueRef = useRef(false)
  const hasSelectionRef = useRef(false)

  const readDraft = () => {
    const editor = editorRef.current
    if (editor && editor.getModel()) draftRef.current = editor.getValue()
    return draftRef.current
  }

  const clearPersistTimer = () => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }
  }

  const sendToParent = () => {
    const draft = readDraft()
    if (draft === valueRef.current) return
    lastSentRef.current = draft
    latest.current.onChangeValue(draft)
  }

  const flushToParent = () => {
    clearPersistTimer()
    sendToParent()
  }

  const schedulePersist = () => {
    clearPersistTimer()
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null
      sendToParent()
    }, QUERY_PERSIST_DELAY_MS)
  }

  const applyExternalValue = (nextValue: string) => {
    valueRef.current = nextValue
    draftRef.current = nextValue
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!editor || !model || model.getValue() === nextValue) return
    applyingExternalValueRef.current = true
    try {
      editor.executeEdits('external-value', [{ range: model.getFullModelRange(), text: nextValue }])
      editor.pushUndoStop()
    } finally {
      applyingExternalValueRef.current = false
    }
  }

  useEffect(() => {
    trackerRef.current?.setError(queryError)
  }, [queryError, tabId])

  useEffect(() => {
    if (tabId !== tabIdRef.current) {
      // The outgoing model's text was captured by onDidChangeModel (or on dispose).
      const previousTabId = tabIdRef.current
      const previousDraft = draftRef.current
      const previousValue = valueRef.current
      clearPersistTimer()
      tabIdRef.current = tabId
      lastSentRef.current = null
      if (previousDraft !== previousValue) latest.current.onPersistTabQuery(previousTabId, previousDraft)
      applyExternalValue(value)
      return
    }

    if (value === lastSentRef.current || value === readDraft()) {
      valueRef.current = value
      return
    }
    applyExternalValue(value)
  }, [tabId, value, latest])

  useEffect(() => {
    const handlers = latest
    return () => {
      clearPersistTimer()
      const draft = readDraft()
      if (draft !== valueRef.current) handlers.current.onChangeValue(draft)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="editor-wrap">
      <MonacoEditor
        height="100%"
        language="pgsql"
        path={tabModelPath(tabId)}
        defaultValue={value}
        onMount={(editor, monaco) => {
          editorRef.current = editor
          draftRef.current = editor.getValue()

          defineSqlEditorThemes(monaco)
          const applyEditorTheme = () => monaco.editor.setTheme(sqlEditorThemeName(getCurrentTheme()))
          applyEditorTheme()
          window.addEventListener('pgstudio:themechange', applyEditorTheme)

          const tracker = createStatementTracker(editor, monaco)
          tracker.setError(latest.current.queryError)
          trackerRef.current = tracker

          const completion = registerSqlCompletionProvider(monaco, {
            getSchemaTables: () => schemaTablesRef.current,
            getCachedColumns: (tableKey) => tableColumnsByKeyRef.current[tableKey],
            ensureColumnsForTable: (schema, table) => latest.current.ensureColumnsForTable(schema, table),
          })

          // Keep the draft readable after the model is gone (unmount, tab switch).
          const captureOnDispose = (model: Monaco.editor.ITextModel | null) =>
            model?.onWillDispose(() => {
              if (editor.getModel() === model) draftRef.current = model.getValue()
            })
          let modelDisposeListener = captureOnDispose(editor.getModel())

          const disposables: Monaco.IDisposable[] = [
            editor.onDidChangeModelContent(() => {
              if (applyingExternalValueRef.current) return
              schedulePersist()
            }),
            editor.onDidChangeModel((event) => {
              if (event.oldModelUrl) {
                const previous = monaco.editor.getModel(event.oldModelUrl)
                if (previous) draftRef.current = previous.getValue()
              }
              modelDisposeListener?.dispose()
              modelDisposeListener = captureOnDispose(editor.getModel())
            }),
            editor.onDidChangeCursorSelection((event) => {
              const hasSelection = !event.selection.isEmpty()
              if (hasSelection === hasSelectionRef.current) return
              hasSelectionRef.current = hasSelection
              latest.current.onSelectionChange(hasSelection)
            }),
          ]

          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
            flushToParent()
            latest.current.onRunQuery()
          })
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
            flushToParent()
            latest.current.onExplainQuery()
          })
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            flushToParent()
            latest.current.onSaveSnippet()
          })

          editor.onDidDispose(() => {
            editorRef.current = null
            trackerRef.current = null
            tracker.dispose()
            completion.dispose()
            modelDisposeListener?.dispose()
            for (const disposable of disposables) disposable.dispose()
            window.removeEventListener('pgstudio:themechange', applyEditorTheme)
          })

          latest.current.onMountEditor(editor)
        }}
        options={EDITOR_OPTIONS}
        theme={SQL_EDITOR_LIGHT_THEME}
      />
    </div>
  )
})
