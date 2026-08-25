import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clearHistory as clearHistoryService, getHistory } from '@/features/sql/sql.service'

export function useSqlEditorHistory(historySearch: string, connectionName: string) {
  const queryClient = useQueryClient()
  const historyQuery = useQuery({
    queryKey: ['sql', 'history', connectionName, 300],
    queryFn: () => getHistory(300, connectionName),
    enabled: Boolean(connectionName),
  })
  const clearHistoryMutation = useMutation({
    mutationFn: () => clearHistoryService(connectionName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sql', 'history', connectionName] }),
  })
  const historyItems = useMemo(() => historyQuery.data?.items || [], [historyQuery.data?.items])

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    if (!q) return historyItems
    return historyItems.filter(
      (item) =>
        item.query_text.toLowerCase().includes(q) ||
        item.connection_name.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q)
    )
  }, [historyItems, historySearch])

  async function loadHistory() {
    await historyQuery.refetch()
  }

  async function clearHistory() {
    await clearHistoryMutation.mutateAsync()
  }

  return {
    filteredHistory,
    loadHistory,
    clearHistory,
    loadingHistory: historyQuery.isFetching,
  }
}
