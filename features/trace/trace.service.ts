import { fetchJson } from '../../lib/http'

export type TraceNode = {
  schema: string
  table: string
  pk: Record<string, unknown> | null
  row: Record<string, unknown> | null
  parents: TraceEdge[]
  children: TraceEdge[]
  childrenTruncated: boolean
  childrenTotal: number
  depth: number
  cycle: boolean
}

export type TraceEdge = {
  via: string
  direction: 'parent' | 'child'
  fkColumns: string[]
  referencedColumns: string[]
  referencedSchema: string
  referencedTable: string
  node: TraceNode
}

export function fetchRowTrace(input: {
  connectionName: string
  schema: string
  table: string
  pk: Record<string, unknown>
  maxDepth?: number
  childLimit?: number
}) {
  const params = new URLSearchParams({ connectionName: input.connectionName })
  return fetchJson<{ ok: boolean; tree: TraceNode }>(`/api/trace/row?${params.toString()}`, {
    method: 'POST',
    body: JSON.stringify({
      schema: input.schema,
      table: input.table,
      pk: input.pk,
      maxDepth: input.maxDepth,
      childLimit: input.childLimit,
    }),
  })
}
