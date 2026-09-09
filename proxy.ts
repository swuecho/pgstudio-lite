import { NextResponse, type NextRequest } from 'next/server'
import { CROSS_SITE_ERROR, isCrossSiteRequest } from '@/lib/api/same-origin'

/**
 * Web-only request filter (Next 16 `proxy.ts`, formerly `middleware.ts`).
 *
 * Rejects state-changing `/api/*` requests that originate from another site.
 * See lib/api/same-origin.ts for the threat model and the decision rules.
 *
 * The desktop build never includes this file: `next.config.js` sets
 * `pageExtensions: ['tsx', 'jsx']` for the static export, and Next only looks
 * for `proxy.<ext>` under those extensions. The Electron API shim serves
 * `/api/*` itself over `app://`, which web content cannot reach.
 */
export default function proxy(request: NextRequest) {
  const crossSite = isCrossSiteRequest({
    method: request.method,
    origin: request.headers.get('origin'),
    secFetchSite: request.headers.get('sec-fetch-site'),
    host: request.headers.get('host'),
  })
  if (!crossSite) return NextResponse.next()
  return NextResponse.json(CROSS_SITE_ERROR, { status: 403 })
}

export const config = {
  matcher: '/api/:path*',
}
