import { parseSql } from './pg-parser'

type ParseNode = Record<string, unknown>

function getNodeType(node: ParseNode | undefined): string | null {
  if (!node) return null
  return Object.keys(node)[0] || null
}

function getResTargetOutputName(target: ParseNode): string | null {
  const resTarget = target.ResTarget as
    | {
        name?: string
        val?: ParseNode
      }
    | undefined
  if (!resTarget?.val) return null

  if (resTarget.name) return resTarget.name

  const valType = getNodeType(resTarget.val)
  if (valType === 'ColumnRef') {
    const fields = (
      resTarget.val.ColumnRef as {
        fields?: Array<{ String?: { str?: string; sval?: string }; sval?: string }>
      }
    )?.fields
    const last = fields?.[fields.length - 1]
    return last?.String?.str ?? last?.String?.sval ?? last?.sval ?? null
  }

  if (valType === 'FuncCall') {
    const func = resTarget.val.FuncCall as { funcname?: Array<{ String?: { str?: string } }> }
    const fn = func.funcname?.[func.funcname.length - 1]?.String?.str
    return fn ? `${fn}(...)` : null
  }

  return null
}

function extractFromSelectStmt(selectStmt: ParseNode): string[] | null {
  const select = selectStmt.SelectStmt as { targetList?: ParseNode[] } | undefined
  const targetList = select?.targetList
  if (!targetList?.length) return null

  const names: string[] = []
  for (const target of targetList) {
    const type = getNodeType(target)
    if (type === 'ResTarget') {
      const name = getResTargetOutputName(target)
      if (!name) return null
      names.push(name)
      continue
    }
    // SELECT * or TABLE.* cannot be represented as a fixed column list.
    return null
  }

  return names
}

function findSelectStmtRoot(stmt: ParseNode): ParseNode | null {
  const type = getNodeType(stmt)
  if (type === 'SelectStmt') return stmt
  if (type === 'ExplainStmt') {
    const inner = (stmt.ExplainStmt as { query?: ParseNode })?.query
    return inner ? findSelectStmtRoot(inner) : null
  }
  return null
}

export function narrowResultToSelectList(
  pgFields: string[],
  rows: Record<string, unknown>[],
  outputColumns: string[] | null
): { fields: string[]; rows: Record<string, unknown>[] } {
  const narrowedFields =
    outputColumns && outputColumns.length > 0 && outputColumns.length < pgFields.length
      ? outputColumns.filter((name) => pgFields.includes(name))
      : []
  if (narrowedFields.length === 0) {
    return { fields: pgFields, rows }
  }
  return {
    fields: narrowedFields,
    rows: rows.map((row) => Object.fromEntries(narrowedFields.map((name) => [name, row[name] ?? null]))),
  }
}

export async function extractSelectOutputColumnNames(sql: string): Promise<string[] | null> {
  const trimmed = sql.trim()
  if (!trimmed) return null

  try {
    const { stmts } = await parseSql(trimmed)
    if (!stmts?.length) return null
    const selectRoot = findSelectStmtRoot(stmts[0].stmt as ParseNode)
    if (!selectRoot) return null
    return extractFromSelectStmt(selectRoot)
  } catch {
    return null
  }
}
