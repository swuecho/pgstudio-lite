import dynamic from 'next/dynamic'
import { loader } from '@monaco-editor/react'
import type { editor as MonacoEditorNs } from 'monaco-editor'
import { memo, useEffect, useRef, type MutableRefObject } from 'react'
import {
  aliasByTableKey,
  buildAliasMap,
  buildMergedColumnSuggestions,
  getClauseColumnContext,
  getDotCompletionContext,
  getQueryTables,
  getTextBeforeCursor,
  isFromJoinTableContext,
  resolveAvailableAlias,
  resolveTableForDotContext,
} from '../../lib/sql-completion-context'
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
  onPersistTabQuery: (tabId: string, value: string) => void
  onMountEditor: (editor: MonacoEditorNs.IStandaloneCodeEditor) => void
  onSelectionChange: (hasSelection: boolean) => void
  onRunQuery: () => void
  onExplainQuery: () => void
  onSaveSnippet: () => void
  schemaTablesRef: MutableRefObject<SchemaTable[]>
  tableColumnsByKeyRef: MutableRefObject<Record<string, string[]>>
  ensureColumnsForTable: (schema: string, table: string) => Promise<string[]>
}

export const EditorPane = memo(function EditorPane({
  tabId,
  value,
  onChangeValue,
  onPersistTabQuery,
  onMountEditor,
  onSelectionChange,
  onRunQuery,
  onExplainQuery,
  onSaveSnippet,
  schemaTablesRef,
  tableColumnsByKeyRef,
  ensureColumnsForTable,
}: EditorPaneProps) {
  const editorRef = useRef<MonacoEditorNs.IStandaloneCodeEditor | null>(null)
  const draftRef = useRef(value)
  const tabIdRef = useRef(tabId)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isApplyingExternalValueRef = useRef(false)
  const onChangeValueRef = useRef(onChangeValue)
  const onPersistTabQueryRef = useRef(onPersistTabQuery)
  const onRunQueryRef = useRef(onRunQuery)
  const onExplainQueryRef = useRef(onExplainQuery)
  const onSaveSnippetRef = useRef(onSaveSnippet)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const onMountEditorRef = useRef(onMountEditor)
  const ensureColumnsForTableRef = useRef(ensureColumnsForTable)

  onChangeValueRef.current = onChangeValue
  ensureColumnsForTableRef.current = ensureColumnsForTable
  onPersistTabQueryRef.current = onPersistTabQuery
  onRunQueryRef.current = onRunQuery
  onExplainQueryRef.current = onExplainQuery
  onSaveSnippetRef.current = onSaveSnippet
  onSelectionChangeRef.current = onSelectionChange
  onMountEditorRef.current = onMountEditor

  const flushToParent = (next?: string) => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }
    const query = next ?? draftRef.current
    if (query === value) return
    onChangeValueRef.current(query)
  }

  const schedulePersist = (next: string) => {
    if (isApplyingExternalValueRef.current) return
    draftRef.current = next
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null
      if (next === value) return
      onChangeValueRef.current(next)
    }, QUERY_PERSIST_DELAY_MS)
  }

  const applyExternalValue = (nextValue: string) => {
    draftRef.current = nextValue
    if (!editorRef.current || editorRef.current.getValue() === nextValue) return
    isApplyingExternalValueRef.current = true
    editorRef.current.setValue(nextValue)
    queueMicrotask(() => {
      isApplyingExternalValueRef.current = false
    })
  }

  useEffect(() => {
    if (tabId !== tabIdRef.current) {
      const previousTabId = tabIdRef.current
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current)
        persistTimerRef.current = null
      }
      onPersistTabQueryRef.current(previousTabId, draftRef.current)
      tabIdRef.current = tabId
      applyExternalValue(value)
      return
    }

    if (value === draftRef.current) return
    applyExternalValue(value)
  }, [tabId, value])

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current)
        persistTimerRef.current = null
      }
      const query = draftRef.current
      onChangeValueRef.current(query)
    }
  }, [])

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
          onMountEditorRef.current(editor)
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
            triggerCharacters: ['.'],
            async provideCompletionItems(model: MonacoEditorNs.ITextModel, position: any) {
              const lineCount = model.getLineCount()
              const lines = Array.from({ length: lineCount }, (_, i) => model.getLineContent(i + 1))
              const textBeforeCursor = getTextBeforeCursor(lines, position)
              const dotContext = getDotCompletionContext(textBeforeCursor)

              const prefixLength = dotContext?.prefix.length ?? 0
              const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: Math.max(1, position.column - prefixLength),
                endColumn: position.column,
              }

              const sql = model.getValue()
              const schemaTables = schemaTablesRef.current

              if (dotContext) {
                const tableRef = resolveTableForDotContext(dotContext, sql, schemaTables)
                if (!tableRef) {
                  return { suggestions: [] }
                }

                const tableKey = `${tableRef.schema}.${tableRef.table}`
                let columns =
                  tableColumnsByKeyRef.current[tableKey] ??
                  (await ensureColumnsForTableRef.current(tableRef.schema, tableRef.table))

                const prefix = dotContext.prefix.toLowerCase()
                if (prefix) {
                  columns = columns.filter((column) => column.toLowerCase().startsWith(prefix))
                }

                return {
                  suggestions: columns.map((column) => ({
                    label: column,
                    kind: monaco.languages.CompletionItemKind.Field,
                    insertText: column,
                    detail: tableKey,
                    range,
                  })),
                }
              }

              const clauseContext = getClauseColumnContext(textBeforeCursor)
              if (clauseContext) {
                const tables = getQueryTables(sql, schemaTables)
                if (tables.length === 0) {
                  return { suggestions: [] }
                }

                const aliases = aliasByTableKey(sql, schemaTables)
                const columnsByTable = await Promise.all(
                  tables.map(async (table) => {
                    const tableKey = `${table.schema}.${table.table}`
                    const columns =
                      tableColumnsByKeyRef.current[tableKey] ??
                      (await ensureColumnsForTableRef.current(table.schema, table.table))
                    return {
                      table,
                      alias: aliases[tableKey] ?? table.table,
                      columns,
                    }
                  })
                )

                const word = model.getWordUntilPosition(position)
                const clauseRange = {
                  startLineNumber: position.lineNumber,
                  endLineNumber: position.lineNumber,
                  startColumn: clauseContext.prefix ? word.startColumn : Math.max(1, position.column),
                  endColumn: position.column,
                }

                const merged = buildMergedColumnSuggestions(columnsByTable, clauseContext.prefix)
                return {
                  suggestions: merged.map((item) => ({
                    label: item.name,
                    kind: monaco.languages.CompletionItemKind.Field,
                    insertText: item.insertText,
                    detail: item.detail,
                    range: clauseRange,
                  })),
                }
              }

              const word = model.getWordUntilPosition(position)
              const defaultRange = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
              }

              const inFromJoin = isFromJoinTableContext(textBeforeCursor)
              const usedAliases = inFromJoin ? Object.keys(buildAliasMap(sql, schemaTables)) : []
              const tableSuggestions = schemaTables.map((item) => {
                const label = `${item.schema}.${item.table}`
                if (!inFromJoin) {
                  return {
                    label,
                    kind: monaco.languages.CompletionItemKind.Class,
                    insertText: label,
                    range: defaultRange,
                  }
                }
                const alias = resolveAvailableAlias(item.table, usedAliases)
                return {
                  label,
                  kind: monaco.languages.CompletionItemKind.Class,
                  insertText: `${label} ${alias} `,
                  detail: `alias ${alias}`,
                  range: defaultRange,
                }
              })

              const keywordSuggestions = keywords.map((keyword) => ({
                label: keyword,
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: keyword,
                range: defaultRange,
              }))

              return {
                suggestions: [...keywordSuggestions, ...tableSuggestions],
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
            onRunQueryRef.current()
          })
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
            flushToParent()
            onExplainQueryRef.current()
          })
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            flushToParent()
            onSaveSnippetRef.current()
          })
          editor.onDidChangeCursorSelection((event) =>
            onSelectionChangeRef.current(!event.selection.isEmpty())
          )
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
