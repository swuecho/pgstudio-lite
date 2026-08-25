import type { StateStorage } from 'zustand/middleware'

export type DebouncedStateStorage = StateStorage & {
  flush: () => void
}

export function createDebouncedStateStorage(delayMs = 500): DebouncedStateStorage {
  let pending: { name: string; value: string } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (!pending) return
    try {
      localStorage.setItem(pending.name, pending.value)
    } catch (error) {
      // Quota exceeded (e.g. large query results) — keep the app running; state stays in memory.
      console.warn('Failed to persist state to localStorage', error)
    }
    pending = null
  }

  return {
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => {
      pending = { name, value }
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, delayMs)
    },
    removeItem: (name) => {
      if (pending?.name === name) pending = null
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      localStorage.removeItem(name)
    },
    flush,
  }
}
