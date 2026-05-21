import dynamic from 'next/dynamic'
import { loader } from '@monaco-editor/react'
import type { editor as MonacoEditorNs } from 'monaco-editor'
import { memo, useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import { getCurrentTheme } from './utils'
import { SchemaTable } from './types'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

const QUERY_PERSIST_DELAY_MS = 400

if (typeof window !== 'undefined') {
  ;(window as any).MonacoEnvironment = {
    ...((window as any).MonacoEnvironment || {}),
    baseUrl: '/api/monaco/',
  }
}

loader.config({ paths: { vs: '/api/monaco' } })

type EditorPaneProps = {
  tabId: string
  value: string
  onChangeValue: (value: string) => void
  onMountEditor: (editor: MonacoEditorNs.IStandaloneCodeEditor) => void
  onSelectionChange: (hasSelection: boolean) => void
  onRunQuery: () => void
  onExplainQuery: () => void
  onSaveSnippet: () => void
  schemaTablesRef: MutableRefObject<SchemaTable[]>
  tableColumnsByKeyRef: MutableRefObject<Record<string, string[]>>
}

function uniqueColumns(tableColumnsByKey: Record<string, string[]>) {
  const seen = new Set<string>()
  const columns: string[] = []
  for (const list of Object.values(tableColumnsByKey)) {
    for (const column of list) {
      if (!seen.has(column)) {
        seen.add(column)
        columns.push(column)
      }
    }
  }
  return columns
}

export const EditorPane = memo(function EditorPane({
  tabId,
  value,
  onChangeValue,
  onMountEditor,
  onSelectionChange,
  onRunQuery,
  onExplainQuery,
  onSaveSnippet,
  schemaTablesRef,
  tableColumnsByKeyRef,
}: EditorPaneProps) {
  const editorRef = useRef<MonacoEditorNs.IStandaloneCodeEditor | null>(null)
  const draftRef = useRef(value)
  const tabIdRef = useRef(tabId)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushToParent = useCallback(
    (next?: string) => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current)
        persistTimerRef.current = null
      }
      const query = next ?? draftRef.current
      onChangeValue(query)
    },
    [onChangeValue]
  )

  const schedulePersist = useCallback(
    (next: string) => {
      draftRef.current = next
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null
        onChangeValue(next)
      }, QUERY_PERSIST_DELAY_MS)
    },
    [onChangeValue]
  )

  useEffect(() => {
    if (tabId !== tabIdRef.current) {
      flushToParent()
      tabIdRef.current = tabId
      draftRef.current = value
      editorRef.current?.setValue(value)
      return
    }

    if (value !== draftRef.current) {
      draftRef.current = value
      editorRef.current?.setValue(value)
    }
  }, [tabId, value, flushToParent])

  useEffect(() => () => flushToParent(), [flushToParent])

  return (
    <div className="editor-wrap">
      <MonacoEditor
        key={tabId}
        height="100%"
        language="pgsql"
        defaultValue={value}
        onChange={(next) => schedulePersist(next || '')}
        onMount={(editor, monaco) => {
          editorRef.current = editor
          draftRef.current = editor.getValue()
          onMountEditor(editor)
          monaco.editor.defineTheme('supabase-light', {
            base: 'vs',
            inherit: true,
            rules: [
              { token: '', background: 'fcfdff' },
              { token: '', background: 'fcfdff', foreground: '101827' },
              { token: 'string.sql', foreground: '1e9f6e' },
              { token: 'comment', foreground: '7d8aa2' },
              { token: 'predefined.sql', foreground: '1f2a3a' },
            ],
            colors: {
              'editor.background': '#fcfdff',
              'editorLineNumber.foreground': '#9ba9bf',
              'editorLineNumber.activeForeground': '#55657f',
            },
          })
          monaco.editor.defineTheme('supabase-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
              { token: '', background: '111827', foreground: 'e5e7eb' },
              { token: 'string.sql', foreground: '34d399' },
              { token: 'comment', foreground: '7c8799' },
              { token: 'predefined.sql', foreground: 'e5e7eb' },
            ],
            colors: {
              'editor.background': '#111827',
              'editorLineNumber.foreground': '#667085',
              'editorLineNumber.activeForeground': '#d0d5dd',
            },
          })

          const keywords = [
            'select',
            'from',
            'where',
            'insert',
            'update',
            'delete',
            'join',
            'left join',
            'group by',
            'order by',
            'limit',
            'offset',
            'create table',
            'alter table',
          ]

          const provider = monaco.languages.registerCompletionItemProvider('pgsql', {
            provideCompletionItems(model: MonacoEditorNs.ITextModel, position: any) {
              const word = model.getWordUntilPosition(position)
              const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
              }

              const tableSuggestions = schemaTablesRef.current.map((item) => ({
                label: `${item.schema}.${item.table}`,
                kind: monaco.languages.CompletionItemKind.Class,
                insertText: `${item.schema}.${item.table}`,
                range,
              }))

              const columnSuggestions = uniqueColumns(tableColumnsByKeyRef.current).map((column) => ({
                label: column,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: column,
                range,
              }))

              const keywordSuggestions = keywords.map((keyword) => ({
                label: keyword,
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: keyword,
                range,
              }))

              return {
                suggestions: [...keywordSuggestions, ...tableSuggestions, ...columnSuggestions],
              }
            },
          })

          const applyEditorTheme = () => {
            monaco.editor.setTheme(getCurrentTheme() === 'dark' ? 'supabase-dark' : 'supabase-light')
          }
          applyEditorTheme()

          window.addEventListener('pgstudio:themechange', applyEditorTheme)
          editor.onDidDispose(() => {
            editorRef.current = null
            provider.dispose()
            window.removeEventListener('pgstudio:themechange', applyEditorTheme)
          })

          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
            flushToParent()
            onRunQuery()
          })
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
            flushToParent()
            onExplainQuery()
          })
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            flushToParent()
            onSaveSnippet()
          })
          editor.onDidChangeCursorSelection((event) => onSelectionChange(!event.selection.isEmpty()))
        }}
        options={{
          tabSize: 2,
          fontSize: 13,
          minimap: { enabled: false },
          wordWrap: 'on',
          lineNumbers: 'on',
          lineNumbersMinChars: 3,
          scrollBeyondLastLine: false,
          automaticLayout: true,
        }}
        theme="supabase-light"
      />
    </div>
  )
})
