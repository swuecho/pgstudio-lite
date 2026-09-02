import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { matchRoute } from '../electron/api/router'
import { routes } from '../electron/api/routes'

const API_DIR = join(process.cwd(), 'pages', 'api')

/**
 * Monaco's two catch-all routes are static file servers, served natively by
 * electron/monaco.ts rather than through the NextApiResponse shim.
 */
const SERVED_NATIVELY = ['/api/monaco/*path', '/api/vs/*path']

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

/** `pages/api/tables/[table]/rows.ts` -> `/api/tables/:table/rows` */
function fileToRoute(file: string): string {
  const parts = relative(API_DIR, file).replace(/\.ts$/, '').split(sep)
  if (parts[parts.length - 1] === 'index') parts.pop()
  const mapped = parts.map((part) =>
    part.startsWith('[...') ? `*${part.slice(4, -1)}` : part.startsWith('[') ? `:${part.slice(1, -1)}` : part
  )
  return ['/api', ...mapped].join('/').replace(/\/$/, '')
}

describe('desktop API route table', () => {
  it('covers every pages/api handler exactly once', () => {
    // Without this, adding an API route and forgetting electron/api/routes.ts
    // would 404 only in a shipped desktop build.
    const onDisk = walk(API_DIR).map(fileToRoute).sort()
    const wired = [...routes.map((route) => route.pattern), ...SERVED_NATIVELY].sort()

    expect(wired).toEqual(onDisk)
  })

  it('has no duplicate patterns', () => {
    const patterns = routes.map((route) => route.pattern)
    expect(patterns).toEqual([...new Set(patterns)])
  })

  it('prefers static segments over dynamic ones', () => {
    // `/api/notebooks/import` also matches `/api/notebooks/:id`; if the dynamic
    // route won, importing a notebook would try to load one with id "import".
    expect(matchRoute('/api/notebooks/import')?.route.pattern).toBe('/api/notebooks/import')
    expect(matchRoute('/api/notebooks/generate-tour')?.route.pattern).toBe('/api/notebooks/generate-tour')
    expect(matchRoute('/api/notebooks/nb_123')?.route.pattern).toBe('/api/notebooks/:id')
  })

  it('extracts dynamic params', () => {
    expect(matchRoute('/api/tables/orders/rows')?.params).toEqual({ table: 'orders' })
    expect(matchRoute('/api/notebooks/nb_1/run-cell')?.params).toEqual({ id: 'nb_1' })
  })

  it('decodes percent-encoded params', () => {
    // Table names are `schema.table` and can contain characters the client
    // encodes, e.g. a space or a slash.
    expect(matchRoute('/api/tables/public.my%20orders/ddl')?.params).toEqual({ table: 'public.my orders' })
  })

  it('does not match unknown or partial paths', () => {
    expect(matchRoute('/api/nope')).toBeNull()
    expect(matchRoute('/api/tables/orders')).toBeNull()
    expect(matchRoute('/api/tables/orders/rows/extra')).toBeNull()
  })
})
