import { useMemo } from 'react'
import { fetchJson } from '../../lib/http'
import { useSqlEditorHistoryStore } from './stores/sqlEditorHistoryStore'

export function useSqlEditorHistory(historySearch: string) {
  const historyItems = useSqlEditorHistoryStore((s) => s.historyItems)
  const setHistoryItems = useSqlEditorHistoryStore((s) => s.setHistoryItems)

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
    const data = await fetchJson<{ items: typeof historyItems }>('/api/history?limit=300')
    setHistoryItems(data.items || [])
  }

  async function clearHistory() {
    await fetchJson<{ ok: boolean }>('/api/history', { method: 'DELETE' })
    await loadHistory()
  }

  return {
    filteredHistory,
    loadHistory,
    clearHistory,
  }
}
