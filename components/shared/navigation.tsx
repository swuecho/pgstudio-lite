import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { useSearch, type AnyRouter } from '@tanstack/react-router'

/**
 * The app's one seam onto TanStack Router.
 *
 * Search params are plain strings (or string arrays for repeated keys) — the
 * router is configured with parseSearchRecord / stringifySearchRecord below
 * instead of TanStack's JSON-style default, which would turn `?pk=123` into a
 * number and quote string values in the URL. That keeps every existing link,
 * bookmark and desktop deep link byte-for-byte unchanged.
 *
 * Components import from here, never from the router package directly, so
 * tests can render them without a RouterProvider (links degrade to plain
 * anchors) and mock navigation in one place.
 */

export type SearchRecord = Record<string, string | string[]>

export type HrefTarget =
  | string
  | {
      pathname: string
      query?: Record<string, string | string[] | number | boolean | null | undefined>
    }

export function parseSearchRecord(search: string): SearchRecord {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const record: SearchRecord = {}
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key)
    record[key] = values.length > 1 ? values : values[0]
  }
  return record
}

export function stringifySearchRecord(search: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) value.forEach((item) => params.append(key, String(item)))
    else params.append(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

export function toHref(target: HrefTarget): string {
  if (typeof target === 'string') return target
  return `${target.pathname}${stringifySearchRecord(target.query ?? {})}`
}

let appRouter: AnyRouter | null = null

/** Called once by src/main.tsx. */
export function registerAppRouter(router: AnyRouter) {
  appRouter = router
}

/**
 * Client-side navigation from anywhere, including non-React code such as grid
 * cell handlers. Falls back to a full page load if no router is mounted.
 */
export function navigateTo(target: HrefTarget, options: { replace?: boolean } = {}) {
  const href = toHref(target)
  if (!appRouter) {
    if (options.replace) window.location.replace(href)
    else window.location.assign(href)
    return Promise.resolve()
  }
  // A replace is a URL sync (filters, depth), not a page change: keep scroll.
  return appRouter.navigate({ href, replace: options.replace, resetScroll: !options.replace })
}

/** The current URL's search params, re-rendering when they change. */
export function useSearchRecord(): SearchRecord {
  return useSearch({ strict: false }) as SearchRecord
}

type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: HrefTarget }

/**
 * An anchor that navigates client-side on a plain left click and otherwise
 * behaves like any link (⌘-click, middle-click and `target="_blank"` open a
 * new window/tab the normal way).
 */
export function AppLink({ href, onClick, ...rest }: AppLinkProps) {
  const url = toHref(href)

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || !appRouter) return
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (rest.target && rest.target !== '_self') return
    event.preventDefault()
    void navigateTo(url)
  }

  return <a {...rest} href={url} onClick={handleClick} />
}
