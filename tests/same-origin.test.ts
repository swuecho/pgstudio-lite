import { describe, expect, it } from 'vitest'
import { isCrossSiteRequest } from '@/lib/api/same-origin'

const base = { method: 'POST', origin: null, secFetchSite: null, host: 'localhost:4180' }

describe('isCrossSiteRequest', () => {
  it('never rejects safe methods', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(
        isCrossSiteRequest({ ...base, method, origin: 'https://evil.example', secFetchSite: 'cross-site' })
      ).toBe(false)
    }
  })

  it('trusts Sec-Fetch-Site when present', () => {
    expect(isCrossSiteRequest({ ...base, secFetchSite: 'same-origin' })).toBe(false)
    expect(isCrossSiteRequest({ ...base, secFetchSite: 'none' })).toBe(false)
    expect(isCrossSiteRequest({ ...base, secFetchSite: 'cross-site' })).toBe(true)
    expect(isCrossSiteRequest({ ...base, secFetchSite: 'same-site' })).toBe(true)
  })

  it('prefers Sec-Fetch-Site over a matching Origin', () => {
    expect(isCrossSiteRequest({ ...base, secFetchSite: 'cross-site', origin: 'http://localhost:4180' })).toBe(
      true
    )
  })

  it('falls back to comparing Origin against Host', () => {
    expect(isCrossSiteRequest({ ...base, origin: 'http://localhost:4180' })).toBe(false)
    expect(isCrossSiteRequest({ ...base, origin: 'http://LOCALHOST:4180', host: 'localhost:4180' })).toBe(
      false
    )
    expect(isCrossSiteRequest({ ...base, origin: 'http://localhost:3000' })).toBe(true)
    expect(isCrossSiteRequest({ ...base, origin: 'https://evil.example' })).toBe(true)
  })

  it('rejects an opaque or malformed Origin', () => {
    expect(isCrossSiteRequest({ ...base, origin: 'null' })).toBe(true)
    expect(isCrossSiteRequest({ ...base, origin: 'not a url' })).toBe(true)
    expect(isCrossSiteRequest({ ...base, origin: 'http://localhost:4180', host: null })).toBe(true)
  })

  it('allows non-browser clients that send neither header', () => {
    expect(isCrossSiteRequest({ ...base, method: 'POST' })).toBe(false)
    expect(isCrossSiteRequest({ ...base, method: 'DELETE', host: null })).toBe(false)
  })
})
