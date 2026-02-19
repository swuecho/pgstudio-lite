import { create } from 'zustand'
import type { ColumnInfo, Connection, RowData, TableInfo } from '../types'

type TableEditorLocalStore = {
  connections: Connection[]
  connectionName: string
  tables: TableInfo[]
  activeTable: string
  columns: ColumnInfo[]
  rows: RowData[]
  totalRows: number
  newRowJson: string
  status: string
  page: number
  pageSize: number
  sortBy: string
  sortOrder: 'asc' | 'desc'
  filterColumn: string
  filterValue: string
  filterMode: 'contains' | 'equals'
  setConnections: (value: Connection[]) => void
  setConnectionName: (value: string) => void
  setTables: (value: TableInfo[] | ((prev: TableInfo[]) => TableInfo[])) => void
  setActiveTable: (value: string) => void
  setColumns: (value: ColumnInfo[]) => void
  setRows: (value: RowData[]) => void
  setTotalRows: (value: number) => void
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
  connections: [],
  connectionName: 'default',
  tables: [],
  activeTable: '',
  columns: [],
  rows: [],
  totalRows: 0,
  newRowJson: '{\n  \n}',
  status: 'Ready',
  page: 0,
  pageSize: 50,
  sortBy: '_ctid',
  sortOrder: 'asc',
  filterColumn: '',
  filterValue: '',
  filterMode: 'contains',
  setConnections: (value) => set({ connections: value }),
  setConnectionName: (value) => set({ connectionName: value }),
  setTables: (value) => set((state) => ({ tables: typeof value === 'function' ? value(state.tables) : value })),
  setActiveTable: (value) => set({ activeTable: value }),
  setColumns: (value) => set({ columns: value }),
  setRows: (value) => set({ rows: value }),
  setTotalRows: (value) => set({ totalRows: value }),
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
