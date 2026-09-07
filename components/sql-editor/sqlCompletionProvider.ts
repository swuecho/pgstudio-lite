import type * as Monaco from 'monaco-editor'
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
} from '@/lib/sql-completion-context'
import type { SchemaTable } from './types'

export type SqlCompletionSource = {
  getSchemaTables: () => SchemaTable[]
  /** Columns already loaded for `schema.table`, if any. */
  getCachedColumns: (tableKey: string) => string[] | undefined
  ensureColumnsForTable: (schema: string, table: string) => Promise<string[]>
}

const KEYWORDS = [
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

/** Schema-aware completions for the `pgsql` language: aliases, columns, tables, keywords. */
export function registerSqlCompletionProvider(
  monaco: typeof Monaco,
  source: SqlCompletionSource
): Monaco.IDisposable {
  async function columnsFor(schema: string, table: string) {
    return (
      source.getCachedColumns(`${schema}.${table}`) ?? (await source.ensureColumnsForTable(schema, table))
    )
  }

  return monaco.languages.registerCompletionItemProvider('pgsql', {
    triggerCharacters: ['.'],
    async provideCompletionItems(model, position) {
      const textBeforeCursor = getTextBeforeCursor(model.getLinesContent(), position)
      const dotContext = getDotCompletionContext(textBeforeCursor)

      const prefixLength = dotContext?.prefix.length ?? 0
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: Math.max(1, position.column - prefixLength),
        endColumn: position.column,
      }

      const sql = model.getValue()
      const schemaTables = source.getSchemaTables()

      if (dotContext) {
        const tableRef = resolveTableForDotContext(dotContext, sql, schemaTables)
        if (!tableRef) {
          return { suggestions: [] }
        }

        const tableKey = `${tableRef.schema}.${tableRef.table}`
        let columns = await columnsFor(tableRef.schema, tableRef.table)

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
          tables.map(async (table) => ({
            table,
            alias: aliases[`${table.schema}.${table.table}`] ?? table.table,
            columns: await columnsFor(table.schema, table.table),
          }))
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

      const keywordSuggestions = KEYWORDS.map((keyword) => ({
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
}
