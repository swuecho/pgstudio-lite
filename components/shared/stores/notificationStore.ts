import { create } from 'zustand'

export type NotificationTone = 'error' | 'warning' | 'success' | 'info'

export type AppNotification = {
  id: string
  tone: NotificationTone
  title: string
  message?: string
  /** ms until auto-dismiss; errors stay until dismissed. */
  timeoutMs?: number
}

type NotifyInput = Omit<AppNotification, 'id'>

type NotificationStore = {
  notifications: AppNotification[]
  notify: (input: NotifyInput) => string
  dismiss: (id: string) => void
  dismissAll: () => void
}

/** Keeps a burst of failures from burying the app. */
const MAX_VISIBLE = 4

const DEFAULT_TIMEOUTS: Record<NotificationTone, number | undefined> = {
  // Errors persist: a failure the user never saw is the problem we're solving.
  error: undefined,
  warning: 8000,
  success: 3000,
  info: 5000,
}

let sequence = 0

function nextId() {
  sequence += 1
  return `notification-${sequence}`
}

export const useNotificationStore = create<NotificationStore>()((set, get) => ({
  notifications: [],

  notify: (input) => {
    const existing = get().notifications
    // Repeated identical failures (a refetch loop, say) shouldn't stack up.
    const duplicate = existing.find(
      (item) => item.tone === input.tone && item.title === input.title && item.message === input.message
    )
    if (duplicate) return duplicate.id

    const notification: AppNotification = {
      ...input,
      id: nextId(),
      timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUTS[input.tone],
    }

    set({ notifications: [...existing, notification].slice(-MAX_VISIBLE) })
    return notification.id
  },

  dismiss: (id) => set((state) => ({ notifications: state.notifications.filter((item) => item.id !== id) })),

  dismissAll: () => set({ notifications: [] }),
}))

/** Callable outside React — used by the React Query cache error handlers. */
export function notify(input: NotifyInput) {
  return useNotificationStore.getState().notify(input)
}
