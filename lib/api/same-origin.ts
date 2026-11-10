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
 * The `Host` check further down (isAllowedHost) closes the DNS-rebinding gap
 * that an origin comparison cannot see.
 *
 * This module is pure so it can be unit-tested; createWebApp() in
 * server/web.ts applies it to every web `/api/*` request, dev and production.
 * The desktop app never runs it: the `app://` protocol is not reachable from
 * web content, and Electron calls the router directly.
 */

import { isIP } from 'node:net'

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

/**
 * Host header validation, against DNS rebinding.
 *
 * The origin check above cannot stop a rebinding attack: a page on
 * `http://attacker.example:4180` whose name the attacker re-points at
 * 127.0.0.1 is same-origin with itself, so the browser sends
 * `Sec-Fetch-Site: same-origin` and a matching `Origin`, and it can read the
 * responses to GETs as well. What gives it away is the `Host` header, which
 * still carries the attacker's name. So every `/api/*` request, whatever its
 * method, must name a host we know to be ours:
 *
 * - `localhost` and `*.localhost`, which resolve to loopback by spec;
 * - any IP literal (`127.0.0.1`, `[::1]`, a LAN address under `HOST=0.0.0.0`).
 *   A browser only sends an IP as `Host` when it connected to that IP, so a
 *   rebinding page can never produce one;
 * - names listed in `PGSTUDIO_ALLOWED_HOSTS` (comma-separated, `*` for any),
 *   for reaching the server by a machine or DNS name.
 *
 * A request with no `Host` header (HTTP/1.0, in-process tests) is allowed:
 * browsers always send one.
 */
export function isAllowedHost(host: string | null, allowedHosts: readonly string[] = []): boolean {
  const raw = host?.trim()
  if (!raw) return true
  if (allowedHosts.includes('*')) return true

  let hostname: string
  try {
    hostname = new URL(`http://${raw}`).hostname.toLowerCase()
  } catch {
    return false
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true
  if (isIP(hostname.replace(/^\[|\]$/g, '')) !== 0) return true
  return allowedHosts.some((allowed) => allowed.toLowerCase() === hostname)
}

/** Parses `PGSTUDIO_ALLOWED_HOSTS`: comma-separated hostnames, without ports. */
export function parseAllowedHosts(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

export const HOST_NOT_ALLOWED_ERROR = {
  error: 'Host not allowed. Add it to PGSTUDIO_ALLOWED_HOSTS to reach PG Studio Lite by this name.',
  code: 'HOST_NOT_ALLOWED',
} as const
