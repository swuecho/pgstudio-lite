import dynamic from 'next/dynamic'
import { loader } from '@monaco-editor/react'
import type { editor as MonacoEditorNs } from 'monaco-editor'
import { useCallback, useRef } from 'react'
import { getCurrentTheme } from '../sql-editor/utils'
import styles from './TableEditorStyles.module.css'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

if (typeof window !== 'undefined') {
  ;(window as any).MonacoEnvironment = {
    ...((window as any).MonacoEnvironment || {}),
    baseUrl: '/api/monaco/',
  }
}

loader.config({ paths: { vs: '/api/monaco' } })

type JsonbCellEditorProps = {
  value: unknown
  onSave: (value: unknown) => void
  onCancel: () => void
}

export function JsonbCellEditor({ value, onSave, onCancel }: JsonbCellEditorProps) {
  const editorRef = useRef<MonacoEditorNs.IStandaloneCodeEditor | null>(null)

  // Convert value to JSON string for display
  const getJsonString = useCallback((val: unknown): string => {
    if (val === null || val === undefined) return 'null'
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val)
        return JSON.stringify(parsed, null, 2)
      } catch {
        return val
      }
    }
    try {
      return JSON.stringify(val, null, 2)
    } catch {
      return String(val)
    }
  }, [])

  const handleMount = useCallback((editor: MonacoEditorNs.IStandaloneCodeEditor, monaco: any) => {
    editorRef.current = editor

    // Define themes (Monaco will handle re-definition gracefully)
    try {
      monaco.editor.defineTheme('supabase-light', {
        base: 'vs',
        inherit: true,
        rules: [
          { token: '', background: 'fcfdff' },
          { token: '', background: 'fcfdff', foreground: '101827' },
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
        ],
        colors: {
          'editor.background': '#111827',
          'editorLineNumber.foreground': '#667085',
          'editorLineNumber.activeForeground': '#d0d5dd',
        },
      })
    } catch {
      // Theme already defined, ignore error
    }

    const applyEditorTheme = () => {
      monaco.editor.setTheme(getCurrentTheme() === 'dark' ? 'supabase-dark' : 'supabase-light')
    }

    applyEditorTheme()
    window.addEventListener('pgstudio:themechange', applyEditorTheme)

    // Format JSON on mount
    setTimeout(() => {
      const action = editor.getAction('editor.action.formatDocument')
      action?.run()
    }, 100)

    // Handle blur to save
    const disposables = [
      editor.onDidBlurEditorText(() => {
        try {
          const raw = editor.getValue()
          const parsed = raw.trim() === '' ? null : JSON.parse(raw)
          onSave(parsed)
        } catch {
          // Invalid JSON, don't save
          onCancel()
        }
      }),
    ]

    editor.onDidDispose(() => {
      window.removeEventListener('pgstudio:themechange', applyEditorTheme)
      disposables.forEach(d => d.dispose())
    })

    // Focus the editor
    editor.focus()
  }, [onSave, onCancel])

  const handleChange = useCallback((_value: string | undefined) => {
    // Just update the editor value, validation happens on blur
  }, [])

  return (
    <div className={styles.jsonbMonacoWrapper}>
      <MonacoEditor
        height="400px"
        language="json"
        value={getJsonString(value)}
        onChange={handleChange}
        onMount={handleMount}
        options={{
          tabSize: 2,
          fontSize: 13,
          minimap: { enabled: false },
          wordWrap: 'on',
          lineNumbers: 'on',
          lineNumbersMinChars: 3,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          formatOnPaste: true,
          formatOnType: true,
          folding: true,
          bracketPairColorization: { enabled: true },
          suggest: {
            showKeywords: false,
            showSnippets: false,
          },
        }}
        theme="supabase-light"
      />
    </div>
  )
}
