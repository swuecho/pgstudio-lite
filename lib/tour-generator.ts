import { randomUUID } from 'node:crypto'
import {
  getTableColumns,
  getTableForeignKeys,
  listTables,
  type ForeignKeyConstraint,
  type TableColumn,
  type TableInfo,
} from './db'
import type { NotebookSpecV1, NotebookSpecV1Cell } from './notebook-types'

const TIMESTAMP_TYPES = new Set([
  'timestamp without time zone',
  'timestamp with time zone',
  'timestamptz',
  'timestamp',
  'date',
])

const MAX_TABLES = 50
const MAX_TIMESTAMP_PROBES_PER_TABLE = 2

function sqlIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function qualified(schema: string, table: string): string {
  return `${sqlIdent(schema)}.${sqlIdent(table)}`
}

function makeCell(input: {
  type: 'sql' | 'markdown'
  content: string
  position: number
  metadata?: Record<string, unknown>
}): NotebookSpecV1Cell {
  return {
    id: randomUUID(),
    type: input.type,
    position: input.position,
    content: input.content,
    metadata: input.metadata,
  }
}

function tableMarkdownHeader(table: TableInfo, columns: TableColumn[]): string {
  const fqn = `${table.schema}.${table.table}`
  const rowsLabel = table.estimatedRows.toLocaleString()
  const lines = [`## \`${fqn}\` &nbsp;<sub>${rowsLabel} rows estimated</sub>`, '']
  if (columns.length > 0) {
    lines.push('| column | type | nullable | key |')
    lines.push('| --- | --- | --- | --- |')
    for (const column of columns) {
      const key = column.isPrimaryKey ? 'PK' : column.foreignKey ? 'FK' : ''
      lines.push(`| \`${column.name}\` | ${column.dataType} | ${column.isNullable ? 'YES' : 'NO'} | ${key} |`)
    }
  }
  return lines.join('\n')
}

function fkJoinExample(table: TableInfo, fk: ForeignKeyConstraint, columns: TableColumn[]): string | null {
  if (fk.columns.length === 0 || fk.columns.length !== fk.referencedColumns.length) return null
  const localQualified = qualified(table.schema, table.table)
  const refQualified = qualified(fk.referencedSchema, fk.referencedTable)
  const onClause = fk.columns
    .map((col, index) => `t.${sqlIdent(col)} = r.${sqlIdent(fk.referencedColumns[index])}`)
    .join(' and ')
  const projectionCols = columns
    .slice(0, 4)
    .map((column) => `t.${sqlIdent(column.name)}`)
    .join(', ')
  return `-- Join with ${fk.referencedSchema}.${fk.referencedTable} via FK ${fk.name}\nselect ${projectionCols}, r.*\nfrom ${localQualified} t\nleft join ${refQualified} r on ${onClause}\nlimit 5;`
}

function timestampProbeSql(table: TableInfo, columnName: string): string {
  const fqn = qualified(table.schema, table.table)
  const col = sqlIdent(columnName)
  return `select min(${col}) as ${sqlIdent(`min_${columnName}`)}, max(${col}) as ${sqlIdent(`max_${columnName}`)} from ${fqn};`
}

async function buildTableCells(
  connectionName: string | undefined,
  table: TableInfo,
  startPosition: number
): Promise<NotebookSpecV1Cell[]> {
  const columns = await getTableColumns(connectionName, table.table, table.schema)
  const cells: NotebookSpecV1Cell[] = []
  let position = startPosition

  cells.push(
    makeCell({
      type: 'markdown',
      content: tableMarkdownHeader(table, columns),
      position: position++,
    })
  )

  const fqn = qualified(table.schema, table.table)
  cells.push(
    makeCell({
      type: 'sql',
      content: `select count(*) as row_count from ${fqn};`,
      position: position++,
    })
  )
  cells.push(
    makeCell({
      type: 'sql',
      content: `select * from ${fqn} limit 5;`,
      position: position++,
    })
  )

  const timestampColumns = columns
    .filter((column) => TIMESTAMP_TYPES.has(column.dataType))
    .slice(0, MAX_TIMESTAMP_PROBES_PER_TABLE)
  for (const column of timestampColumns) {
    cells.push(
      makeCell({
        type: 'sql',
        content: timestampProbeSql(table, column.name),
        position: position++,
      })
    )
  }

  try {
    const fks = await getTableForeignKeys(connectionName, table.schema, table.table)
    const firstFk = fks[0]
    if (firstFk) {
      const example = fkJoinExample(table, firstFk, columns)
      if (example) {
        cells.push(makeCell({ type: 'sql', content: example, position: position++ }))
      }
    }
  } catch {
    // FK introspection is best-effort; skip if it fails.
  }

  return cells
}

export async function generateTourNotebook(input: {
  connectionName?: string
  schema?: string
  maxTables?: number
}): Promise<NotebookSpecV1> {
  const maxTables = Math.max(1, Math.min(200, input.maxTables ?? MAX_TABLES))
  const { tables, truncated: tablesTruncated } = await listTables(input.connectionName)
  const filteredBySchema = input.schema
    ? tables.filter((table) => table.schema === input.schema)
    : tables.filter((table) => table.schema === 'public')
  const candidates =
    filteredBySchema.length > 0
      ? filteredBySchema
      : tables.filter((table) => !['pg_catalog', 'information_schema'].includes(table.schema))
  const sorted = [...candidates]
    .filter((table) => table.kind === 'table' || table.kind === 'view' || table.kind === 'materialized_view')
    .sort((a, b) => b.estimatedRows - a.estimatedRows)
  const truncated = sorted.length > maxTables || tablesTruncated
  const selected = sorted.slice(0, maxTables)

  const cells: NotebookSpecV1Cell[] = []
  const introLines = [
    '# Database tour',
    '',
    `Auto-generated overview of **${selected.length}** ${selected.length === 1 ? 'relation' : 'relations'}` +
      (input.schema ? ` in schema \`${input.schema}\`` : ' in schema `public`') +
      `, ordered by estimated row count.`,
    '',
    'Each section contains a count, a 5-row sample, timestamp ranges (if any), and a join example through the first foreign key. Run the cells you care about — nothing executes automatically.',
  ]
  if (truncated) {
    introLines.push('')
    introLines.push(
      `> Note: showing the top ${maxTables} ${maxTables === 1 ? 'table' : 'tables'} by estimated rows; more exist.`
    )
  }
  cells.push(makeCell({ type: 'markdown', content: introLines.join('\n'), position: 0 }))

  let position = 1
  for (const table of selected) {
    const tableCells = await buildTableCells(input.connectionName, table, position)
    cells.push(...tableCells)
    position += tableCells.length
  }

  const titleSchema = input.schema || 'public'
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  return {
    spec_version: '1.0',
    title: `Tour: ${titleSchema} (${stamp})`,
    description: 'Auto-generated database tour.',
    connection_name: input.connectionName,
    cells,
  }
}
