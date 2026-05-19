import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type SqlEditorExplorerStore = {
  expandedSchemasByConnection: Record<string, Record<string, boolean>>
  expandedTablesByConnection: Record<string, Record<string, boolean>>
  setExpandedSchemasForConnection: (
    connectionName: string,
    updater: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)
  ) => void
  setExpandedTablesForConnection: (
    connectionName: string,
    updater: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)
  ) => void
}

export const useSqlEditorExplorerStore = create<SqlEditorExplorerStore>()(
  persist(
    (set) => ({
      expandedSchemasByConnection: {},
      expandedTablesByConnection: {},
      setExpandedSchemasForConnection: (connectionName, updater) =>
        set((state) => {
          const prev = state.expandedSchemasByConnection[connectionName] ?? {}
          const next = typeof updater === 'function' ? updater(prev) : updater
          return {
            expandedSchemasByConnection: {
              ...state.expandedSchemasByConnection,
              [connectionName]: next,
            },
          }
        }),
      setExpandedTablesForConnection: (connectionName, updater) =>
        set((state) => {
          const prev = state.expandedTablesByConnection[connectionName] ?? {}
          const next = typeof updater === 'function' ? updater(prev) : updater
          return {
            expandedTablesByConnection: {
              ...state.expandedTablesByConnection,
              [connectionName]: next,
            },
          }
        }),
    }),
    {
      name: 'pgstudio-sql-editor-explorer',
      partialize: (state) => ({
        expandedSchemasByConnection: state.expandedSchemasByConnection,
        expandedTablesByConnection: state.expandedTablesByConnection,
      }),
    }
  )
)
