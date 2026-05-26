import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  controlBackend,
  fetchLocks,
  fetchSessions,
  fetchStatements,
  statementsAction,
  type StatementsOrderBy,
} from './activity.service'

export function useActivitySessions(
  connectionName: string,
  options: { intervalMs: number; paused: boolean; enabled?: boolean }
) {
  return useQuery({
    queryKey: ['activity', 'sessions', connectionName],
    queryFn: () => fetchSessions(connectionName),
    enabled: Boolean(connectionName) && options.enabled !== false,
    refetchInterval: options.paused ? false : options.intervalMs,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  })
}

export function useActivityLocks(
  connectionName: string,
  options: { intervalMs: number; paused: boolean; enabled: boolean }
) {
  return useQuery({
    queryKey: ['activity', 'locks', connectionName],
    queryFn: () => fetchLocks(connectionName),
    enabled: Boolean(connectionName) && options.enabled,
    refetchInterval: options.paused ? false : options.intervalMs,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  })
}

export function useActivityStatements(
  connectionName: string,
  options: { intervalMs: number; paused: boolean; enabled: boolean; orderBy: StatementsOrderBy }
) {
  return useQuery({
    queryKey: ['activity', 'statements', connectionName, options.orderBy],
    queryFn: () => fetchStatements(connectionName, options.orderBy),
    enabled: Boolean(connectionName) && options.enabled,
    refetchInterval: options.paused ? false : options.intervalMs,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  })
}

export function useStatementsAction(connectionName: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (action: 'install' | 'reset') =>
      statementsAction({ action, connectionName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity', 'statements', connectionName] })
    },
  })
}

export function useControlBackend(connectionName: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { pid: number; action: 'cancel' | 'terminate' }) =>
      controlBackend({ ...input, connectionName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity', 'sessions', connectionName] })
      queryClient.invalidateQueries({ queryKey: ['activity', 'locks', connectionName] })
    },
  })
}
