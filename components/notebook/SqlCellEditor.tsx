import dynamic from 'next/dynamic'
import { loader } from '@monaco-editor/react'
import type { editor as MonacoEditorNs } from 'monaco-editor'
import { getCurrentTheme } from '../sql-editor/utils'

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
  onChange: (value: string) => void
  onRun: () => void
  onRunAndFocusNext: () => void
  onMountEditor: (editor: MonacoEditorNs.IStandaloneCodeEditor) => void
  onUnmountEditor: () => void
}

export function SqlCellEditor({
  value,
  disabled,
  onChange,
  onRun,
  onRunAndFocusNext,
  onMountEditor,
  onUnmountEditor,
}: SqlCellEditorProps) {
  return (
    <div className="notebook-sql-editor">
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

          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
            onRun()
          })

          editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
            onRunAndFocusNext()
          })

          editor.onDidDispose(() => {
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
