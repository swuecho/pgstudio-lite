import type { QueryResult } from '../components/sql-editor/types'

export type ResolvedNotebookOption = {
  value: string
  label: string
}

export function mapQueryResultToOptions(result: QueryResult): ResolvedNotebookOption[] {
  const statement = result.statements.find((item) => item.fields.length > 0)
  if (!statement) return []

  const firstField = statement.fields[0]
  const secondField = statement.fields[1]

  return statement.rows
    .map((row) => {
      const rawValue = row.value ?? (firstField ? row[firstField] : undefined)
      if (rawValue === null || rawValue === undefined) return null

      const value = String(rawValue).trim()
      if (!value) return null

      const rawLabel = row.label ?? (secondField ? row[secondField] : undefined)
      const label = rawLabel === null || rawLabel === undefined ? value : String(rawLabel).trim() || value
      return { value, label }
    })
    .filter((item): item is ResolvedNotebookOption => Boolean(item))
}
