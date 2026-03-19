import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listConnections } from '../../../features/connections/connections.service'

export const CONNECTIONS_QUERY_KEY = ['connections'] as const

export function useConnections() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: CONNECTIONS_QUERY_KEY,
    queryFn: listConnections,
  })

  const connections = query.data?.connections || []
  const configured = query.data?.configured ?? false
  const defaultConnectionName =
    query.data?.defaultConnectionName ??
    connections.find((connection) => connection.isDefault)?.name ??
    connections[0]?.name ??
    null

  return {
    ...query,
    connections,
    configured,
    defaultConnectionName,
    invalidateConnections: () => queryClient.invalidateQueries({ queryKey: CONNECTIONS_QUERY_KEY }),
  }
}
