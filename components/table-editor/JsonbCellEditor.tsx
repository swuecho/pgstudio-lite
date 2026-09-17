import dynamic from 'next/dynamic'
import { loader } from '@monaco-editor/react'
import type { editor as MonacoEditorNs } from 'monaco-editor'
import { useCallback, useEffect, useRef } from 'react'
import { getCurrentTheme } from '../sql-editor/utils'
import { defineEditorThemes, editorThemeName } from '../sql-editor/editorThemes'
import { useActiveConnectionColor } from '@/components/shared/ConnectionColorContext'
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
  /** The JSON text being edited; the modal owns it so Tree and Raw stay in sync. */
  text: string
  onChange: (text: string) => void
}

export function JsonbCellEditor({ text, onChange }: JsonbCellEditorProps) {
  const editorRef = useRef<MonacoEditorNs.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<any>(null)
  const connectionColor = useActiveConnectionColor().colorId
  const connectionColorRef = useRef(connectionColor)
  connectionColorRef.current = connectionColor

  useEffect(() => {
    monacoRef.current?.editor.setTheme(editorThemeName(getCurrentTheme(), connectionColor))
  }, [connectionColor])

  const handleMount = useCallback((editor: MonacoEditorNs.IStandaloneCodeEditor, monaco: any) => {
    editorRef.current = editor

    defineEditorThemes(monaco)

    monacoRef.current = monaco
    const applyEditorTheme = () => {
      monaco.editor.setTheme(editorThemeName(getCurrentTheme(), connectionColorRef.current))
    }

    applyEditorTheme()
    window.addEventListener('pgstudio:themechange', applyEditorTheme)

    // Format JSON on mount
    setTimeout(() => {
      const action = editor.getAction('editor.action.formatDocument')
      action?.run()
    }, 100)

    editor.onDidDispose(() => {
      window.removeEventListener('pgstudio:themechange', applyEditorTheme)
    })

    // Focus the editor
    editor.focus()
  }, [])

  const handleChange = useCallback(
    (next: string | undefined) => {
      onChange(next ?? '')
    },
    [onChange]
  )

  return (
    <div className={styles.jsonbMonacoWrapper}>
      <MonacoEditor
        height="400px"
        language="json"
        value={text}
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
