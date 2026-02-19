import dynamic from 'next/dynamic'
import { loader } from '@monaco-editor/react'
import type { editor as MonacoEditorNs } from 'monaco-editor'
import type { MutableRefObject } from 'react'
import { getCurrentTheme } from './utils'
import { SchemaTable } from './types'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

if (typeof window !== 'undefined') {
  ;(window as any).MonacoEnvironment = {
    ...((window as any).MonacoEnvironment || {}),
    baseUrl: '/api/monaco/',
  }
}

loader.config({ paths: { vs: '/api/monaco' } })

type EditorPaneProps = {
  value: string
  onChangeValue: (value: string) => void
  onMountEditor: (editor: MonacoEditorNs.IStandaloneCodeEditor) => void
  onSelectionChange: (hasSelection: boolean) => void
  onRunQuery: () => void
  onSaveSnippet: () => void
  schemaTablesRef: MutableRefObject<SchemaTable[]>
  tableColumnsByKeyRef: MutableRefObject<Record<string, string[]>>
}

export function EditorPane({
  value,
  onChangeValue,
  onMountEditor,
  onSelectionChange,
  onRunQuery,
  onSaveSnippet,
  schemaTablesRef,
  tableColumnsByKeyRef,
}: EditorPaneProps) {
  return (
    <div className="editor-wrap">
      <MonacoEditor
        height="100%"
        language="pgsql"
        value={value}
        onChange={(next) => onChangeValue(next || '')}
        onMount={(editor, monaco) => {
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

              const columnSuggestions = Object.values(tableColumnsByKeyRef.current)
                .flatMap((columns) => columns)
                .filter((v, i, arr) => arr.indexOf(v) === i)
                .map((column) => ({
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
            provider.dispose()
            window.removeEventListener('pgstudio:themechange', applyEditorTheme)
          })

          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
            onRunQuery()
          })
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
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
}
