import type { ActivitySession } from '@/features/activity/activity.service'

/** Seconds → "850ms", "12.3s", "4m 05s", "2h 15m". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '-'
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m < 60) return `${m}m ${s}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

/** "Lock:relation", or whichever half of the wait event is present. */
export function formatWait(session: Pick<ActivitySession, 'wait_event_type' | 'wait_event'>): string {
  if (!session.wait_event_type && !session.wait_event) return ''
  if (session.wait_event_type && session.wait_event) return `${session.wait_event_type}:${session.wait_event}`
  return session.wait_event_type || session.wait_event || ''
}

/** Milliseconds → "0.25ms", "12.5ms", "1.20s", "2.50m". */
export function formatMs(value: number): string {
  if (!Number.isFinite(value)) return '-'
  if (value < 1) return `${value.toFixed(2)}ms`
  if (value < 1000) return `${value.toFixed(1)}ms`
  if (value < 60_000) return `${(value / 1000).toFixed(2)}s`
  return `${(value / 60_000).toFixed(2)}m`
}

export function formatNumber(value: number): string {
  return value.toLocaleString()
}

/** Queries longer than this are truncated until the row is expanded. */
export const QUERY_PREVIEW_LIMIT = 200
