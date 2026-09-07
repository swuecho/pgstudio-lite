// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyTextToClipboard } from '../lib/clipboard'

function installClipboard(value: unknown) {
  Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value })
}

describe('copyTextToClipboard', () => {
  afterEach(() => {
    installClipboard(undefined)
    // @ts-expect-error jsdom has no execCommand; tests install their own
    delete document.execCommand
  })

  it('uses the async Clipboard API when it works', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    installClipboard({ writeText })
    await expect(copyTextToClipboard('abc')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('abc')
  })

  it('falls back to execCommand when the Clipboard API rejects', async () => {
    // What Chromium raises when clipboard-sanitized-write is denied.
    installClipboard({ writeText: vi.fn().mockRejectedValue(new Error('Write permission denied.')) })
    let selected = ''
    document.execCommand = vi.fn((command: string) => {
      if (command !== 'copy') return false
      selected = (document.activeElement as HTMLTextAreaElement | null)?.value ?? ''
      return true
    })

    await expect(copyTextToClipboard('fallback text')).resolves.toBe(true)
    expect(selected).toBe('fallback text')
    // The scratch textarea does not linger in the DOM.
    expect(document.querySelectorAll('textarea')).toHaveLength(0)
  })

  it('falls back to execCommand when there is no Clipboard API', async () => {
    installClipboard(undefined)
    document.execCommand = vi.fn(() => true)
    await expect(copyTextToClipboard('x')).resolves.toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('reports failure when neither path is available', async () => {
    installClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) })
    await expect(copyTextToClipboard('x')).resolves.toBe(false)
  })
})
