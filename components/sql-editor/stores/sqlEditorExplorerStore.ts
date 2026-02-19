import { create } from 'zustand'
import type { SchemaTable } from '../types'

type SqlEditorExplorerStore = {
  schemaTables: SchemaTable[]
  tableColumnsByKey: Record<string, string[]>
  loadingColumnsByKey: Record<string, boolean>
  expandedSchemas: Record<string, boolean>
  expandedTables: Record<string, boolean>
  setSchemaTables: (tables: SchemaTable[]) => void
  setTableColumnsByKey: (updater: Record<string, string[]> | ((prev: Record<string, string[]>) => Record<string, string[]>)) => void
  setLoadingColumnsByKey: (updater: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void
  setExpandedSchemas: (updater: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void
  setExpandedTables: (updater: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void
}

export const useSqlEditorExplorerStore = create<SqlEditorExplorerStore>((set) => ({
  schemaTables: [],
  tableColumnsByKey: {},
  loadingColumnsByKey: {},
  expandedSchemas: {},
  expandedTables: {},
  setSchemaTables: (tables) => set({ schemaTables: tables }),
  setTableColumnsByKey: (updater) =>
    set((state) => ({
      tableColumnsByKey: typeof updater === 'function' ? updater(state.tableColumnsByKey) : updater,
    })),
  setLoadingColumnsByKey: (updater) =>
    set((state) => ({
      loadingColumnsByKey: typeof updater === 'function' ? updater(state.loadingColumnsByKey) : updater,
    })),
  setExpandedSchemas: (updater) =>
    set((state) => ({
      expandedSchemas: typeof updater === 'function' ? updater(state.expandedSchemas) : updater,
    })),
  setExpandedTables: (updater) =>
    set((state) => ({
      expandedTables: typeof updater === 'function' ? updater(state.expandedTables) : updater,
    })),
}))
