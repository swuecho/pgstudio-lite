import { parseSql } from './pg-parser'

/**
 * Parse-tree node types that modify data, schema, or server state. A statement
 * whose tree contains any of these anywhere is refused on a read-only
 * connection before it reaches Postgres.
 *
 * The check walks the whole tree rather than looking at the root node only, so
 * a write hidden inside a data-modifying CTE (`with t as (insert ...) select`),
 * an `EXPLAIN ANALYZE` (which executes the statement), or a `PREPARE` is caught
 * as well. `SELECT ... INTO` creates a table and is treated as a write too.
 *
 * This is the user-facing layer: it exists to give a clear 403 up front. The
 * hard guarantee is that lib/db/query.ts runs every statement of a read-only
 * connection inside an explicit `BEGIN READ ONLY` transaction, which Postgres
 * enforces regardless of what the statement does to session settings.
 */
export const WRITE_STMT_TYPES = new Set([
  'InsertStmt',
  'UpdateStmt',
  'DeleteStmt',
  'MergeStmt',
  'CreateStmt',
  'CreateSchemaStmt',
  'CreateFunctionStmt',
  'CreatePLangStmt',
  'CreateTableAsStmt',
  'CreateSeqStmt',
  'CreateRoleStmt',
  'CreateTrigStmt',
  'CreateCastStmt',
  'CreateOpClassStmt',
  'CreateOpFamilyStmt',
  'CreateConversionStmt',
  'CreateDomainStmt',
  'CreateExtensionStmt',
  'CreateFdwStmt',
  'CreateForeignServerStmt',
  'CreateForeignTableStmt',
  'CreatePolicyStmt',
  'CreatePublicationStmt',
  'CreateStatsStmt',
  'CreateSubStmt',
  'CreateTransformStmt',
  'CreateAmStmt',
  'CreateUserMappingStmt',
  'IndexStmt',
  'ViewStmt',
  'RuleStmt',
  'AlterTableStmt',
  'AlterDomainStmt',
  'AlterFunctionStmt',
  'AlterObjectDependsStmt',
  'AlterObjectSchemaStmt',
  'AlterOwnerStmt',
  'AlterOperatorStmt',
  'AlterTypeStmt',
  'AlterPolicyStmt',
  'AlterSeqStmt',
  'AlterSystemStmt',
  'AlterTSConfigStmt',
  'AlterTSDictStmt',
  'AlterCollationStmt',
  'AlterFdwStmt',
  'AlterForeignServerStmt',
  'AlterDefaultPrivilegesStmt',
  'AlterExtensionStmt',
  'AlterExtensionContentsStmt',
  'AlterPublicationStmt',
  'AlterSubStmt',
  'AlterRoleStmt',
  'AlterStatsStmt',
  'AlterOpFamilyStmt',
  'RenameStmt',
  'DropStmt',
  'TruncateStmt',
  'GrantStmt',
  'CommentStmt',
  'VacuumStmt',
  'ReindexStmt',
  'ClusterStmt',
  'RefreshMatViewStmt',
  'CallStmt',
  'DoStmt',
  'CopyStmt',
  'ListenStmt',
  'NotifyStmt',
  'UnlistenStmt',
  'DiscardStmt',
  'DefineStmt',
  'CompositeTypeStmt',
  'SecLabelStmt',
  'ImportForeignSchemaStmt',
  'CheckPointStmt',
])

type ParseNode = Record<string, unknown>

function isNode(value: unknown): value is ParseNode {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Reads the scalar behind an option argument: `String`, `Integer`, `Boolean`, or `A_Const`. */
function optionArgumentValue(arg: unknown): string | number | boolean | undefined {
  if (!isNode(arg)) return undefined
  const constant = isNode(arg.A_Const) ? arg.A_Const : arg
  for (const key of ['String', 'Integer', 'Boolean', 'sval', 'ival', 'boolval'] as const) {
    const wrapped = constant[key]
    if (isNode(wrapped)) {
      const inner = wrapped.sval ?? wrapped.ival ?? wrapped.boolval
      if (inner !== undefined) return inner as string | number | boolean
    }
  }
  return undefined
}

/** `EXPLAIN ANALYZE` executes the inner statement; plain `EXPLAIN` does not. */
function explainExecutes(explain: ParseNode): boolean {
  const options = Array.isArray(explain.options) ? explain.options : []
  return options.some((option) => {
    const def = isNode(option) ? (option.DefElem as ParseNode | undefined) : undefined
    if (!def || typeof def.defname !== 'string' || def.defname.toLowerCase() !== 'analyze') return false
    // Bare `ANALYZE` has no argument and means on.
    if (def.arg === undefined) return true
    const value = optionArgumentValue(def.arg)
    if (typeof value === 'string') return !['false', 'off', '0', 'no'].includes(value.toLowerCase())
    if (typeof value === 'number') return value !== 0
    if (typeof value === 'boolean') return value
    // Unknown shape: assume it executes.
    return true
  })
}

/** True when any node in the tree is a write. Exported for unit tests. */
export function containsWriteNode(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(containsWriteNode)
  if (!isNode(node)) return false

  for (const [key, value] of Object.entries(node)) {
    if (WRITE_STMT_TYPES.has(key)) return true
    if (key === 'SelectStmt' && isNode(value) && value.intoClause) return true
    if (key === 'ExplainStmt' && isNode(value)) {
      if (explainExecutes(value) && containsWriteNode(value.query)) return true
      continue
    }
    if (containsWriteNode(value)) return true
  }
  return false
}

/**
 * Whether `sql` (one or more statements) would write on execution. Throws the
 * parser's syntax error for invalid SQL, like `parseSql` itself.
 */
export async function isWriteStatement(sql: string): Promise<boolean> {
  const { stmts } = await parseSql(sql)
  if (!stmts || stmts.length === 0) return false
  return stmts.some((statement) => containsWriteNode(statement.stmt))
}
