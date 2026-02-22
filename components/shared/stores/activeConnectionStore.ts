import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ActiveConnectionStore = {
  connectionName: string
  setConnectionName: (value: string) => void
}

export const useActiveConnectionStore = create<ActiveConnectionStore>()(
  persist(
    (set) => ({
      connectionName: 'default',
      setConnectionName: (value) => set({ connectionName: value }),
    }),
    {
      name: 'pgstudio-active-connection',
      partialize: (state) => ({ connectionName: state.connectionName }),
    }
  )
)
