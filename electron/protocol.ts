import { protocol } from 'electron'
import { dispatchApi } from './api/router'
import { serveMonaco } from './monaco'
import { serveStatic } from './static'

/**
 * The renderer is served from `app://pgstudio`, not `file://`. That is a hard
 * requirement rather than a preference:
 *
 *  - `secure: true` makes it a secure context, which `navigator.clipboard`
 *    needs; seven components copy cell values with it.
 *  - `standard: true` gives it a real tuple origin, so `localStorage` is stable
 *    across launches (eight modules persist state there, including every
 *    zustand store) and relative `fetch('/api/…')` resolves correctly — which
 *    is why lib/http.ts needs no desktop-specific branch.
 */
export const APP_SCHEME = 'app'
export const APP_HOST = 'pgstudio'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`

/** Must be called at module scope in the main process, before `app.whenReady()`. */
export function registerAppScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        codeCache: true,
        corsEnabled: true,
        allowServiceWorkers: false,
        bypassCSP: false,
      },
    },
  ])
}

/** Must be called after `app.whenReady()`. */
export function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    let url: URL
    try {
      url = new URL(request.url)
    } catch {
      return new Response('Bad Request', { status: 400 })
    }

    if (url.hostname !== APP_HOST) {
      return new Response('Not Found', { status: 404 })
    }

    const monacoResponse = serveMonaco(url.pathname)
    if (monacoResponse) return monacoResponse

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return dispatchApi(request, url)
    }

    return serveStatic(url.pathname)
  })
}
