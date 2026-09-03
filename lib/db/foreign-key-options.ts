import { getForeignKeyDisplayConfig } from './foreign-key-display'
import { withClient } from './client'
import { sqlIdent } from './sql'
import { getTableColumnsWithClient, type TableColumn } from './introspect'

const FK_LABEL_TYPE_HINTS = ['char', 'text', 'name', 'citext']
const FK_LABEL_NAME_RANKS = [
  ['display_name', 'displayname', 'display'],
  ['full_name', 'fullname'],
  ['name'],
  ['email'],
  ['username', 'user_name'],
  ['title'],
  ['label'],
  ['slug'],
  ['code'],
  ['description'],
]

function isLabelLikeType(dataType: string): boolean {
  const type = dataType.toLowerCase()
  return FK_LABEL_TYPE_HINTS.some((hint) => type.includes(hint))
}

function normalizeLabelColumnName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function pickForeignKeyLabelColumn(columns: TableColumn[], valueColumn: string): string | undefined {
  const candidates = columns.filter(
    (column) => column.name !== valueColumn && isLabelLikeType(column.dataType)
  )
  if (candidates.length === 0) return undefined

  for (const rank of FK_LABEL_NAME_RANKS) {
    const rankedNames = new Set(rank.map(normalizeLabelColumnName))
    const match = candidates.find((column) => rankedNames.has(normalizeLabelColumnName(column.name)))
    if (match) return match.name
  }

  return candidates[0]?.name
}

export type ForeignKeyOption = {
  value: unknown
  label: string
  selected?: boolean
}

export type ForeignKeyLabelColumn = {
  name: string
  selected: boolean
  source: 'configured' | 'heuristic' | 'none'
}

function toForeignKeyOption(row: Record<string, unknown>, hasLabelColumn: boolean): ForeignKeyOption {
  const value = row.value
  const label =
    hasLabelColumn && row.label !== null && row.label !== undefined ? String(row.label) : String(value)
  return { value, label }
}

/**
 * Lists candidate values for a foreign-key column by reading the referenced
 * table's key column (plus a best-effort human-readable label column). Used by
 * the insert-row form so a FK field can be picked from existing values.
 */
export async function getForeignKeyOptions(
  connectionName: string | undefined,
  schema: string,
  table: string,
  column: string,
  search: string,
  limit: number,
  selectedValue?: string
): Promise<{
  options: ForeignKeyOption[]
  truncated: boolean
  labelColumn: string | null
  labelColumnSource: 'configured' | 'heuristic' | 'none'
  availableLabelColumns: ForeignKeyLabelColumn[]
}> {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50))
  return withClient(connectionName, async (client) => {
    const columns = await getTableColumnsWithClient(client, schema, table)
    if (!columns.some((c) => c.name === column)) {
      const error = new Error(`unknown column '${column}'`) as Error & { statusCode?: number }
      error.statusCode = 400
      throw error
    }
    const configuredDisplayColumns =
      getForeignKeyDisplayConfig({ connectionName, schema, table })?.displayColumns ?? []
    const configuredLabelColumn = configuredDisplayColumns.find((configuredColumn) =>
      columns.some((candidate) => candidate.name === configuredColumn && candidate.name !== column)
    )
    const heuristicLabelColumn = pickForeignKeyLabelColumn(columns, column)
    const labelColumn = configuredLabelColumn ?? heuristicLabelColumn
    const labelColumnSource = configuredLabelColumn
      ? 'configured'
      : heuristicLabelColumn
        ? 'heuristic'
        : 'none'
    const availableLabelColumns = columns
      .filter((candidate) => candidate.name !== column)
      .map((candidate) => ({
        name: candidate.name,
        selected: candidate.name === labelColumn,
        source:
          candidate.name === configuredLabelColumn
            ? ('configured' as const)
            : candidate.name === heuristicLabelColumn
              ? ('heuristic' as const)
              : ('none' as const),
      }))

    const qTable = `${sqlIdent(schema)}.${sqlIdent(table)}`
    const qValue = sqlIdent(column)
    const qLabel = labelColumn ? sqlIdent(labelColumn) : null
    const selectList = qLabel ? `${qValue} as value, ${qLabel} as label` : `${qValue} as value`
    const hasLabelColumn = Boolean(qLabel)

    const params: unknown[] = []
    const whereParts = [`${qValue} is not null`]
    const trimmed = search.trim()
    if (trimmed) {
      const searchTargets = qLabel ? [`${qValue}::text`, `${qLabel}::text`] : [`${qValue}::text`]
      params.push(`%${trimmed}%`)
      whereParts.push(`(${searchTargets.map((target) => `${target} ilike $${params.length}`).join(' or ')})`)
    }

    const sql = `
      select distinct ${selectList}
      from ${qTable}
      where ${whereParts.join(' and ')}
      order by ${qLabel ? 'label, value' : 'value'}
      limit ${safeLimit + 1}
    `
    const { rows } = await client.query(sql, params)
    const truncated = rows.length > safeLimit
    const options: ForeignKeyOption[] = rows
      .slice(0, safeLimit)
      .map((row: Record<string, unknown>) => toForeignKeyOption(row, hasLabelColumn))
    const trimmedSelectedValue = selectedValue?.trim()

    if (trimmedSelectedValue) {
      const selectedResult = await client.query(
        `
          select ${selectList}
          from ${qTable}
          where ${qValue}::text = $1
          limit 1
        `,
        [trimmedSelectedValue]
      )
      const selectedRow = selectedResult.rows[0]
      if (selectedRow) {
        const selectedOption = {
          ...toForeignKeyOption(selectedRow, hasLabelColumn),
          selected: true,
        }
        const selectedOptionValue = String(selectedOption.value)
        const remainingOptions = options.filter((option) => String(option.value) !== selectedOptionValue)
        return {
          options: [selectedOption, ...remainingOptions],
          truncated,
          labelColumn: labelColumn ?? null,
          labelColumnSource,
          availableLabelColumns,
        }
      }
    }

    return {
      options,
      truncated,
      labelColumn: labelColumn ?? null,
      labelColumnSource,
      availableLabelColumns,
    }
  })
}
