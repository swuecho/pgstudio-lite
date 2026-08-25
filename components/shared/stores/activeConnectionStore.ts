import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ActiveConnectionStore = {
  connectionName: string
  setConnectionName: (value: string) => void
}

export const useActiveConnectionStore = create<ActiveConnectionStore>()(
  persist(
    (set) => ({
      /**
       * Empty means "not resolved yet", not a connection named "default".
       * Connection-scoped queries all guard on `Boolean(connectionName)`, so
       * this keeps them from firing against a guessed name on first render —
       * which 400s whenever no connection happens to be called "default".
       * `useActiveConnection` fills it in once the connection list loads.
       */
      connectionName: '',
      setConnectionName: (value) => set({ connectionName: value }),
    }),
    {
      name: 'pgstudio-active-connection',
      partialize: (state) => ({ connectionName: state.connectionName }),
    }
  )
)
