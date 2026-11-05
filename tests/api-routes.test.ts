import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { handleApiRequest, matchRoute } from '@/server/router'
import { routes } from '@/server/routes'
import { allowedMethods } from '@/server/route'

const API_DIR = join(process.cwd(), 'server', 'api')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

/** `server/api/tables/[table]/rows.ts` -> `/api/tables/:table/rows` */
function fileToRoute(file: string): string {
  const parts = relative(API_DIR, file).replace(/\.ts$/, '').split(sep)
  if (parts[parts.length - 1] === 'index') parts.pop()
  const mapped = parts.map((part) =>
    part.startsWith('[...') ? `*${part.slice(4, -1)}` : part.startsWith('[') ? `:${part.slice(1, -1)}` : part
  )
  return ['/api', ...mapped].join('/').replace(/\/$/, '')
}

describe('API route table', () => {
  it('covers every server/api route file exactly once', () => {
    // Without this, adding a route file and forgetting server/routes.ts would
    // 404 at runtime.
    const onDisk = walk(API_DIR).map(fileToRoute).sort()
    const wired = routes.map((route) => route.pattern).sort()

    expect(wired).toEqual(onDisk)
  })

  it('only holds .ts route files that define at least one method', () => {
    expect(walk(API_DIR).filter((file) => !file.endsWith('.ts'))).toEqual([])
    for (const route of routes) {
      expect(allowedMethods(route.handler), route.pattern).not.toEqual([])
    }
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

describe('handleApiRequest', () => {
  const request = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init)

  it('ignores paths outside /api so callers can serve static files', async () => {
    expect(await handleApiRequest(request('/table-editor'))).toBeNull()
    expect(await handleApiRequest(request('/apix'))).toBeNull()
  })

  it('404s an unknown API path with a JSON error', async () => {
    const response = await handleApiRequest(request('/api/nope'))
    expect(response?.status).toBe(404)
    expect(await response?.json()).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('405s a method the route does not define, listing the allowed ones', async () => {
    const response = await handleApiRequest(request('/api/query', { method: 'GET' }))
    expect(response?.status).toBe(405)
    expect(response?.headers.get('Allow')).toBe('POST')
    expect(await response?.json()).toEqual({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
  })

  it('400s a body that is not JSON before reaching the handler', async () => {
    const response = await handleApiRequest(request('/api/query', { method: 'POST', body: '{nope' }))
    expect(response?.status).toBe(400)
    expect(await response?.json()).toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('turns handler validation errors into 400s', async () => {
    const response = await handleApiRequest(
      request('/api/query', { method: 'POST', body: JSON.stringify({ query: '   ' }) })
    )
    expect(response?.status).toBe(400)
    expect(await response?.json()).toMatchObject({ error: 'query is required', code: 'INVALID_REQUEST' })
  })

  it('routes Monaco asset paths to the file server', async () => {
    const loader = await handleApiRequest(request('/api/monaco/loader.js'))
    expect(loader?.status).toBe(200)
    expect(loader?.headers.get('Content-Type')).toContain('javascript')

    const bad = await handleApiRequest(request('/api/vs/not%20a%20segment'))
    expect(bad?.status).toBe(400)
  })
})
