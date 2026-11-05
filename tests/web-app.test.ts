import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createWebApp } from '../server/web'

// A body that fails validation before any database access, so a 400 proves the
// request got past the same-origin guard and into the route.
const blankQuery = { method: 'POST', body: JSON.stringify({ query: '   ' }) }

describe('createWebApp() API', () => {
  const app = createWebApp()

  it('rejects a cross-site POST before it reaches the router', async () => {
    const response = await app.request('/api/query', {
      ...blankQuery,
      headers: { 'Sec-Fetch-Site': 'cross-site' },
    })
    expect(response.status).toBe(403)
  })

  it('lets a same-origin POST through to the route', async () => {
    const response = await app.request('/api/query', {
      ...blankQuery,
      headers: { 'Sec-Fetch-Site': 'same-origin' },
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'query is required' })
  })

  it('answers unknown API paths with the JSON 404', async () => {
    const response = await app.request('/api/nope')
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('serves nothing outside /api without a distDir', async () => {
    expect((await app.request('/table-editor')).status).toBe(404)
  })
})

describe('createWebApp({ distDir })', () => {
  let distDir: string
  let app: ReturnType<typeof createWebApp>

  beforeAll(() => {
    distDir = mkdtempSync(join(tmpdir(), 'pgstudio-dist-'))
    mkdirSync(join(distDir, 'assets'))
    writeFileSync(join(distDir, 'index.html'), '<!doctype html><title>shell</title>')
    writeFileSync(join(distDir, 'assets', 'app-abc123.js'), 'console.log(1)')
    app = createWebApp({ distDir })
  })

  afterAll(() => rmSync(distDir, { recursive: true, force: true }))

  it('serves built assets with a long-lived cache', async () => {
    const response = await app.request('/assets/app-abc123.js')
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('javascript')
    expect(response.headers.get('Cache-Control')).toContain('immutable')
    expect(await response.text()).toBe('console.log(1)')
  })

  it('serves the SPA shell for client routes, revalidated', async () => {
    for (const path of ['/', '/table-editor', '/notebooks/nb_1']) {
      const response = await app.request(path)
      expect(response.status, path).toBe(200)
      expect(response.headers.get('Cache-Control'), path).toBe('no-cache')
      expect(await response.text(), path).toContain('<title>shell</title>')
    }
  })

  it('404s a missing file instead of returning the shell', async () => {
    expect((await app.request('/assets/missing.js')).status).toBe(404)
  })

  it('does not serve files outside distDir', async () => {
    expect((await app.request('/assets/..%2F..%2Fetc%2Fpasswd')).status).toBe(404)
  })

  it('still routes /api ahead of static files', async () => {
    expect(await (await app.request('/api/nope')).json()).toMatchObject({ code: 'NOT_FOUND' })
  })
})
