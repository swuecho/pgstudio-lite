import { create } from 'zustand'
type SqlEditorExplorerStore = {
  expandedSchemas: Record<string, boolean>
  expandedTables: Record<string, boolean>
  setExpandedSchemas: (updater: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void
  setExpandedTables: (updater: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void
}

export const useSqlEditorExplorerStore = create<SqlEditorExplorerStore>((set) => ({
  expandedSchemas: {},
  expandedTables: {},
  setExpandedSchemas: (updater) =>
    set((state) => ({
      expandedSchemas: typeof updater === 'function' ? updater(state.expandedSchemas) : updater,
    })),
  setExpandedTables: (updater) =>
    set((state) => ({
      expandedTables: typeof updater === 'function' ? updater(state.expandedTables) : updater,
    })),
}))
