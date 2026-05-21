import { create } from 'zustand'
import type { TableFilterMode } from '../../../lib/table-filter'
import type { TableEditorFilter } from './tableEditorFilterStore'

type TableEditorLocalStore = {
  activeTable: string
  status: string
  page: number
  pageSize: number
  sortBy: string
  sortOrder: 'asc' | 'desc'
  filterColumn: string
  filterValue: string
  filterValueEnd: string
  filterMode: TableFilterMode
  filterDebounceMs: number
  skipFilterRestore: boolean
  visibleColumns: string[]
  applyTableNavigation: (args: { activeTable: string; filter?: TableEditorFilter }) => void
  setActiveTable: (value: string) => void
  setStatus: (value: string) => void
  setPage: (value: number | ((prev: number) => number)) => void
  setPageSize: (value: number) => void
  setSortBy: (value: string) => void
  setSortOrder: (value: 'asc' | 'desc') => void
  setFilterColumn: (value: string) => void
  setFilterValue: (value: string) => void
  setFilterValueEnd: (value: string) => void
  setFilterMode: (value: TableFilterMode) => void
  setVisibleColumns: (value: string[]) => void
  toggleVisibleColumn: (columnName: string) => void
}

export const useTableEditorLocalStore = create<TableEditorLocalStore>((set) => ({
  activeTable: '',
  status: 'Ready',
  page: 0,
  pageSize: 50,
  sortBy: '',
  sortOrder: 'asc',
  filterColumn: '',
  filterValue: '',
  filterValueEnd: '',
  filterMode: 'contains',
  filterDebounceMs: 300,
  skipFilterRestore: false,
  visibleColumns: [],
  applyTableNavigation: ({ activeTable, filter }) =>
    set({
      activeTable,
      page: 0,
      sortBy: '',
      visibleColumns: [],
      filterDebounceMs: filter ? 0 : 300,
      skipFilterRestore: Boolean(filter),
      ...(filter
        ? {
            filterColumn: filter.filterColumn,
            filterMode: filter.filterMode,
            filterValue: filter.filterValue,
            filterValueEnd: filter.filterValueEnd,
          }
        : {
            filterColumn: '',
            filterValue: '',
            filterValueEnd: '',
            filterMode: 'contains',
          }),
    }),
  setActiveTable: (value) => set({ activeTable: value }),
  setStatus: (value) => set({ status: value }),
  setPage: (value) => set((state) => ({ page: typeof value === 'function' ? value(state.page) : value })),
  setPageSize: (value) => set({ pageSize: value }),
  setSortBy: (value) => set({ sortBy: value }),
  setSortOrder: (value) => set({ sortOrder: value }),
  setFilterColumn: (value) => set({ filterColumn: value }),
  setFilterValue: (value) => set({ filterValue: value }),
  setFilterValueEnd: (value) => set({ filterValueEnd: value }),
  setFilterMode: (value) => set({ filterMode: value }),
  setVisibleColumns: (value) => set({ visibleColumns: value }),
  toggleVisibleColumn: (columnName) =>
    set((state) => ({
      visibleColumns: state.visibleColumns.includes(columnName)
        ? state.visibleColumns.filter((c) => c !== columnName)
        : [...state.visibleColumns, columnName],
    })),
}))
