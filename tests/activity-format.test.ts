import { describe, expect, it } from 'vitest'
import { formatDuration, formatMs, formatWait } from '../components/activity/activityFormat'

describe('activity formatters', () => {
  it('formats durations across units', () => {
    expect(formatDuration(0.25)).toBe('250ms')
    expect(formatDuration(12.34)).toBe('12.3s')
    expect(formatDuration(245)).toBe('4m 5s')
    expect(formatDuration(8100)).toBe('2h 15m')
  })

  it('renders invalid durations as a dash', () => {
    expect(formatDuration(-1)).toBe('-')
    expect(formatDuration(Number.NaN)).toBe('-')
  })

  it('formats milliseconds across units', () => {
    expect(formatMs(0.254)).toBe('0.25ms')
    expect(formatMs(12.34)).toBe('12.3ms')
    expect(formatMs(1200)).toBe('1.20s')
    expect(formatMs(150_000)).toBe('2.50m')
    expect(formatMs(Number.POSITIVE_INFINITY)).toBe('-')
  })

  it('joins wait event type and name when both are present', () => {
    expect(formatWait({ wait_event_type: 'Lock', wait_event: 'relation' })).toBe('Lock:relation')
    expect(formatWait({ wait_event_type: 'Client', wait_event: null })).toBe('Client')
    expect(formatWait({ wait_event_type: null, wait_event: null })).toBe('')
  })
})
