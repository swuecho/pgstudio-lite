import dynamic from 'next/dynamic'
import { loader } from '@monaco-editor/react'
import type { editor as MonacoEditorNs } from 'monaco-editor'
import { useEffect, useRef } from 'react'
import { getCurrentTheme } from '../sql-editor/utils'
import type { NotebookInputType } from './types'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

if (typeof window !== 'undefined') {
  ;(window as any).MonacoEnvironment = {
    ...((window as any).MonacoEnvironment || {}),
    baseUrl: '/api/monaco/',
  }
}

loader.config({ paths: { vs: '/api/monaco' } })

type SqlCellEditorProps = {
  value: string
  disabled?: boolean
  params?: Array<{ key: string; label: string; inputType: NotebookInputType }>
  onChange: (value: string) => void
  onRun: () => void
  onRunAndFocusNext: () => void
  onMountEditor: (editor: MonacoEditorNs.IStandaloneCodeEditor) => void
  onUnmountEditor: () => void
}

export function SqlCellEditor({
  value,
  disabled,
  params = [],
  onChange,
  onRun,
  onRunAndFocusNext,
  onMountEditor,
  onUnmountEditor,
}: SqlCellEditorProps) {
  const paramsRef = useRef(params)
  useEffect(() => {
    paramsRef.current = params
  }, [params])

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)]">
      <MonacoEditor
        height="190px"
        language="pgsql"
        value={value}
        onChange={(next) => onChange(next || '')}
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

          const applyEditorTheme = () => {
            monaco.editor.setTheme(getCurrentTheme() === 'dark' ? 'supabase-dark' : 'supabase-light')
          }

          applyEditorTheme()
          window.addEventListener('pgstudio:themechange', applyEditorTheme)

          const provider = monaco.languages.registerCompletionItemProvider('pgsql', {
            triggerCharacters: ['{'],
            provideCompletionItems(model: MonacoEditorNs.ITextModel, position: any) {
              const linePrefix = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              })
              const match = linePrefix.match(/{{\s*([A-Za-z0-9_]*)$/)
              if (!match) return { suggestions: [] }

              const typed = match[1] || ''
              const startColumn = position.column - typed.length
              const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn,
                endColumn: position.column,
              }

              const suggestions = paramsRef.current
                .filter((item) => !typed || item.key.toLowerCase().startsWith(typed.toLowerCase()))
                .map((item) => ({
                  label: item.key,
                  kind: monaco.languages.CompletionItemKind.Variable,
                  insertText: `${item.key}}}`,
                  detail: `${item.label} (${item.inputType})`,
                  documentation: `Notebook input: ${item.label}`,
                  range,
                }))

              return { suggestions }
            },
          })

          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
            onRun()
          })

          editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
            onRunAndFocusNext()
          })

          editor.onDidDispose(() => {
            provider.dispose()
            window.removeEventListener('pgstudio:themechange', applyEditorTheme)
            onUnmountEditor()
          })
        }}
        options={{
          readOnly: disabled,
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
