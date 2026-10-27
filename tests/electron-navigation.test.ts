import { describe, expect, it, vi } from 'vitest'
import { buildTraceHref } from '../lib/trace-url'

vi.mock('electron', () => ({ protocol: {} }))

const { classifyUrl } = await import('../electron/navigation')

describe('electron navigation guard', () => {
  it('keeps row-trace links inside the app', () => {
    // These open with target="_blank"; denying them is what made click-to-trace
    // a silent no-op in the desktop build.
    const href = buildTraceHref({ connectionName: 'local', schema: 'public', table: 'orders', pk: { id: 1 } })
    expect(classifyUrl(new URL(href, 'app://pgstudio').toString())).toBe('app')
  })

  it('sends http(s) to the OS browser', () => {
    expect(classifyUrl('https://www.postgresql.org/docs/')).toBe('external')
    expect(classifyUrl('http://localhost:4180/')).toBe('external')
  })

  it('blocks other schemes, other app hosts and junk', () => {
    expect(classifyUrl('file:///etc/passwd')).toBe('blocked')
    expect(classifyUrl('javascript:alert(1)')).toBe('blocked')
    expect(classifyUrl('app://elsewhere/trace')).toBe('blocked')
    expect(classifyUrl('not a url')).toBe('blocked')
  })
})
