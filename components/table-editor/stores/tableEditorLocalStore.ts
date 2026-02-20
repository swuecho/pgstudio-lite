import { create } from 'zustand'

type TableEditorLocalStore = {
  connectionName: string
  activeTable: string
  newRowJson: string
  status: string
  page: number
  pageSize: number
  sortBy: string
  sortOrder: 'asc' | 'desc'
  filterColumn: string
  filterValue: string
  filterMode: 'contains' | 'equals'
  setConnectionName: (value: string) => void
  setActiveTable: (value: string) => void
  setNewRowJson: (value: string) => void
  setStatus: (value: string) => void
  setPage: (value: number | ((prev: number) => number)) => void
  setPageSize: (value: number) => void
  setSortBy: (value: string) => void
  setSortOrder: (value: 'asc' | 'desc') => void
  setFilterColumn: (value: string) => void
  setFilterValue: (value: string) => void
  setFilterMode: (value: 'contains' | 'equals') => void
}

export const useTableEditorLocalStore = create<TableEditorLocalStore>((set) => ({
  connectionName: 'default',
  activeTable: '',
  newRowJson: '{\n  \n}',
  status: 'Ready',
  page: 0,
  pageSize: 50,
  sortBy: '_ctid',
  sortOrder: 'asc',
  filterColumn: '',
  filterValue: '',
  filterMode: 'contains',
  setConnectionName: (value) => set({ connectionName: value }),
  setActiveTable: (value) => set({ activeTable: value }),
  setNewRowJson: (value) => set({ newRowJson: value }),
  setStatus: (value) => set({ status: value }),
  setPage: (value) => set((state) => ({ page: typeof value === 'function' ? value(state.page) : value })),
  setPageSize: (value) => set({ pageSize: value }),
  setSortBy: (value) => set({ sortBy: value }),
  setSortOrder: (value) => set({ sortOrder: value }),
  setFilterColumn: (value) => set({ filterColumn: value }),
  setFilterValue: (value) => set({ filterValue: value }),
  setFilterMode: (value) => set({ filterMode: value }),
}))
