import { useEffect } from 'react'
import { useNotificationStore, type AppNotification } from './stores/notificationStore'

function NotificationCard({ notification }: { notification: AppNotification }) {
  const dismiss = useNotificationStore((state) => state.dismiss)

  useEffect(() => {
    if (!notification.timeoutMs) return
    const timer = setTimeout(() => dismiss(notification.id), notification.timeoutMs)
    return () => clearTimeout(timer)
  }, [dismiss, notification.id, notification.timeoutMs])

  return (
    <div
      className={`notification notification-${notification.tone}`}
      role={notification.tone === 'error' ? 'alert' : 'status'}
    >
      <div className="notification-body">
        <div className="notification-title">{notification.title}</div>
        {notification.message ? <div className="notification-message">{notification.message}</div> : null}
      </div>
      <button
        type="button"
        className="notification-dismiss"
        aria-label={`Dismiss: ${notification.title}`}
        onClick={() => dismiss(notification.id)}
      >
        ×
      </button>
    </div>
  )
}

/**
 * App-level feedback region. Before this, a failed background request showed
 * nothing at all — a 500 on every table open went unnoticed because the only
 * error surfaces were local component state.
 */
export function NotificationCenter() {
  const notifications = useNotificationStore((state) => state.notifications)
  if (notifications.length === 0) return null

  return (
    <div className="notification-region" aria-live="polite" aria-label="Notifications">
      {notifications.map((notification) => (
        <NotificationCard key={notification.id} notification={notification} />
      ))}
    </div>
  )
}
