import { beforeEach, describe, expect, it } from 'vitest'
import { notify, useNotificationStore } from '@/components/shared/stores/notificationStore'

describe('notificationStore', () => {
  beforeEach(() => {
    useNotificationStore.getState().dismissAll()
  })

  it('records a notification callable from outside React', () => {
    notify({ tone: 'error', title: 'Request failed', message: 'boom' })

    const { notifications } = useNotificationStore.getState()
    expect(notifications).toHaveLength(1)
    expect(notifications[0].title).toBe('Request failed')
  })

  it('collapses repeats so a refetch loop cannot bury the app', () => {
    const first = notify({ tone: 'error', title: 'Request failed', message: 'boom' })
    const second = notify({ tone: 'error', title: 'Request failed', message: 'boom' })

    expect(second).toBe(first)
    expect(useNotificationStore.getState().notifications).toHaveLength(1)
  })

  it('keeps only the most recent few', () => {
    for (let index = 0; index < 8; index += 1) {
      notify({ tone: 'error', title: `Failure ${index}` })
    }

    const { notifications } = useNotificationStore.getState()
    expect(notifications).toHaveLength(4)
    expect(notifications.at(-1)?.title).toBe('Failure 7')
  })

  it('leaves errors on screen but expires successes', () => {
    notify({ tone: 'error', title: 'Stays' })
    notify({ tone: 'success', title: 'Goes' })

    const byTitle = Object.fromEntries(
      useNotificationStore.getState().notifications.map((item) => [item.title, item])
    )
    expect(byTitle.Stays.timeoutMs).toBeUndefined()
    expect(byTitle.Goes.timeoutMs).toBeGreaterThan(0)
  })

  it('dismisses by id', () => {
    const id = notify({ tone: 'info', title: 'Dismiss me' })
    useNotificationStore.getState().dismiss(id)
    expect(useNotificationStore.getState().notifications).toHaveLength(0)
  })
})
