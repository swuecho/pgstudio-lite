import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TableFilterMode } from '../../../lib/table-filter'

export type TableEditorFilter = {
  filterColumn: string
  filterMode: TableFilterMode
  filterValue: string
  filterValueEnd: string
}

/** @deprecated Use TableEditorFilter */
export type SavedTableFilter = TableEditorFilter

type TableEditorFilterStore = {
  filtersByKey: Record<string, TableEditorFilter>
  setFilterForKey: (key: string, filter: TableEditorFilter) => void
  clearFilterForKey: (key: string) => void
}

export function tableEditorFilterKey(connectionName: string, activeTable: string) {
  return `${connectionName}\0${activeTable}`
}

export const useTableEditorFilterStore = create<TableEditorFilterStore>()(
  persist(
    (set) => ({
      filtersByKey: {},
      setFilterForKey: (key, filter) =>
        set((state) => ({
          filtersByKey: { ...state.filtersByKey, [key]: filter },
        })),
      clearFilterForKey: (key) =>
        set((state) => {
          const next = { ...state.filtersByKey }
          delete next[key]
          return { filtersByKey: next }
        }),
    }),
    {
      name: 'pgstudio-table-editor-filters',
      partialize: (state) => ({ filtersByKey: state.filtersByKey }),
    }
  )
)
