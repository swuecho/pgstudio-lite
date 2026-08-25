import { useQueryClient } from '@tanstack/react-query'
import { lookupReferencedRow } from '@/features/table/table.service'

export function foreignKeyLookupQueryKey(
  connectionName: string,
  schema: string,
  table: string,
  match: Record<string, unknown>
) {
  return ['table', 'fk-lookup', connectionName, schema, table, match] as const
}

export function useForeignKeyLookup() {
  const queryClient = useQueryClient()

  async function fetchReferencedRow(args: {
    connectionName: string
    schema: string
    table: string
    match: Record<string, unknown>
  }) {
    const queryKey = foreignKeyLookupQueryKey(args.connectionName, args.schema, args.table, args.match)
    return queryClient.fetchQuery({
      queryKey,
      queryFn: () => lookupReferencedRow(args),
      staleTime: 30_000,
    })
  }

  return { fetchReferencedRow }
}
