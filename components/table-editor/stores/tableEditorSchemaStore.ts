import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type TableEditorSchemaStore = {
  selectedSchemaByConnection: Record<string, string>
  setSelectedSchemaForConnection: (connectionName: string, schema: string) => void
}

export const useTableEditorSchemaStore = create<TableEditorSchemaStore>()(
  persist(
    (set) => ({
      selectedSchemaByConnection: {},
      setSelectedSchemaForConnection: (connectionName, schema) =>
        set((state) => ({
          selectedSchemaByConnection: {
            ...state.selectedSchemaByConnection,
            [connectionName]: schema,
          },
        })),
    }),
    {
      name: 'pgstudio-table-editor-schema',
      partialize: (state) => ({ selectedSchemaByConnection: state.selectedSchemaByConnection }),
    }
  )
)
