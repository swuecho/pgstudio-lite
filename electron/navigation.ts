import { APP_HOST, APP_SCHEME } from './protocol'

/**
 * Where a URL the renderer tries to open or navigate to should go:
 *
 *  - `app`: our own origin. Stays inside the app (e.g. the row-trace links,
 *    which open `/trace?…` with `target="_blank"` just as they do in a browser).
 *  - `external`: http(s), handed to the OS browser.
 *  - `blocked`: anything else (file:, javascript:, other app:// hosts, junk).
 */
export type UrlDestination = 'app' | 'external' | 'blocked'

export function classifyUrl(rawUrl: string): UrlDestination {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return 'blocked'
  }
  if (parsed.protocol === `${APP_SCHEME}:`) {
    return parsed.hostname === APP_HOST ? 'app' : 'blocked'
  }
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return 'external'
  return 'blocked'
}
