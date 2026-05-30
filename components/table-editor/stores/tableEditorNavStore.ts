import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { MAX_RECENT_TABLES } from '../../../lib/table-editor-nav'

export const EMPTY_TABLE_KEYS: string[] = []

function sameKeyOrder(a: string[], b: string[]) {
  return a.length === b.length && a.every((key, index) => key === b[index])
}

type TableEditorNavStore = {
  pinnedByConnection: Record<string, string[]>
  recentByConnection: Record<string, string[]>
  togglePinned: (connectionName: string, tableKey: string) => void
  recordRecent: (connectionName: string, tableKey: string) => void
}

function withoutKey(keys: string[], tableKey: string) {
  return keys.filter((key) => key !== tableKey)
}

function withRecentFront(keys: string[], tableKey: string) {
  return [tableKey, ...withoutKey(keys, tableKey)].slice(0, MAX_RECENT_TABLES)
}

export const useTableEditorNavStore = create<TableEditorNavStore>()(
  persist(
    (set) => ({
      pinnedByConnection: {},
      recentByConnection: {},
      togglePinned: (connectionName, tableKey) =>
        set((state) => {
          const current = state.pinnedByConnection[connectionName] ?? EMPTY_TABLE_KEYS
          const next = current.includes(tableKey) ? withoutKey(current, tableKey) : [...current, tableKey]
          if (sameKeyOrder(current, next)) return state
          return {
            pinnedByConnection: {
              ...state.pinnedByConnection,
              [connectionName]: next,
            },
          }
        }),
      recordRecent: (connectionName, tableKey) =>
        set((state) => {
          const current = state.recentByConnection[connectionName] ?? EMPTY_TABLE_KEYS
          const next = withRecentFront(current, tableKey)
          if (sameKeyOrder(current, next)) return state
          return {
            recentByConnection: {
              ...state.recentByConnection,
              [connectionName]: next,
            },
          }
        }),
    }),
    {
      name: 'pgstudio-table-editor-nav',
      partialize: (state) => ({
        pinnedByConnection: state.pinnedByConnection,
        recentByConnection: state.recentByConnection,
      }),
    }
  )
)
