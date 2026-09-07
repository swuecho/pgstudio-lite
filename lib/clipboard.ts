/**
 * Copy text to the clipboard, resolving to whether it worked.
 *
 * Prefers the async Clipboard API. When that is missing or rejects (Chromium
 * gates it behind the `clipboard-sanitized-write` permission, which embedded
 * shells and the desktop app's permission handler may deny), falls back to the
 * legacy selection + `execCommand('copy')` path, which only needs to run
 * inside a user gesture. Callers should surface a `false` result instead of
 * silently doing nothing.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through to the legacy path
    }
  }
  return copyWithExecCommand(text)
}

function copyWithExecCommand(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.setAttribute('aria-hidden', 'true')
  // Off-screen rather than display:none, which would make it unselectable.
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'
  const active = document.activeElement as HTMLElement | null
  document.body.appendChild(textarea)
  try {
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
    active?.focus?.()
  }
}
