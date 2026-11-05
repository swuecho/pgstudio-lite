/**
 * Cross-site request detection for the web build's `/api/*` routes.
 *
 * The web server has no authentication: it trusts whoever can reach it, which
 * is the point of a local tool. That trust must not extend to other origins
 * running in the same browser. The API router parses request bodies as JSON
 * whatever their Content-Type, and a form POST (`enctype="text/plain"` can
 * carry a JSON-shaped body) is a CORS "simple request" that browsers send
 * without a preflight, so without this check any web page could auto-submit a
 * form to `http://localhost:4180/api/query` and run SQL with the stored
 * credentials.
 *
 * This module is pure so it can be unit-tested; createWebApp() in
 * server/web.ts applies it to every web `/api/*` request, dev and production.
 * The desktop app never runs it: the `app://` protocol is not reachable from
 * web content, and Electron calls the router directly.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export type OriginCheckInput = {
  method: string
  /** Value of the `Origin` request header, if any. */
  origin: string | null
  /** Value of the `Sec-Fetch-Site` request header, if any. */
  secFetchSite: string | null
  /** Value of the `Host` request header (hostname plus port), if any. */
  host: string | null
}

/**
 * True when a state-changing request came from a different origin.
 *
 * Decision order:
 * 1. Safe methods are never rejected; reads cannot be exfiltrated cross-origin
 *    because no route sets CORS headers.
 * 2. `Sec-Fetch-Site` is authoritative when present: browsers set it and it
 *    cannot be forged by page content. `same-origin` and `none` (a direct
 *    navigation or extension) pass; `cross-site` and `same-site` fail.
 * 3. Otherwise the `Origin` header's host must equal the `Host` header.
 * 4. A request with neither header is not from a browser page (curl, tests,
 *    scripts) and is allowed; CSRF is a browser problem.
 */
export function isCrossSiteRequest(input: OriginCheckInput): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return false

  const secFetchSite = input.secFetchSite?.trim().toLowerCase()
  if (secFetchSite) return secFetchSite !== 'same-origin' && secFetchSite !== 'none'

  const origin = input.origin?.trim()
  if (!origin) return false
  if (origin.toLowerCase() === 'null') return true

  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return true
  }
  const host = input.host?.trim()
  if (!host) return true
  return originHost.toLowerCase() !== host.toLowerCase()
}

export const CROSS_SITE_ERROR = {
  error: 'Cross-site request rejected',
  code: 'CROSS_SITE_REQUEST',
} as const
