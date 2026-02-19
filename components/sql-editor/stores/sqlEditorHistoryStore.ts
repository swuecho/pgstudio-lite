import { create } from 'zustand'
import type { HistoryItem } from '../types'

type SqlEditorHistoryStore = {
  historyItems: HistoryItem[]
  setHistoryItems: (items: HistoryItem[]) => void
}

export const useSqlEditorHistoryStore = create<SqlEditorHistoryStore>((set) => ({
  historyItems: [],
  setHistoryItems: (items) => set({ historyItems: items }),
}))
