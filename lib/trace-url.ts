export function buildTraceHref(args: {
  connectionName: string
  schema: string
  table: string
  pk: Record<string, unknown>
  depth?: number
}) {
  const params = new URLSearchParams({
    connectionName: args.connectionName,
    schema: args.schema,
    table: args.table,
    pk: JSON.stringify(args.pk),
  })
  if (args.depth !== undefined) {
    params.set('depth', String(args.depth))
  }
  return `/trace?${params.toString()}`
}
