import { describe, expect, it } from 'vitest'
import { isAllowedHost, isCrossSiteRequest, parseAllowedHosts } from '@/lib/api/same-origin'

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

describe('isAllowedHost', () => {
  it('accepts loopback names and IP literals, with or without a port', () => {
    for (const host of [
      'localhost',
      'localhost:4180',
      'LOCALHOST:4180',
      'app.localhost:4180',
      '127.0.0.1:4180',
      '[::1]:4180',
      '192.168.1.20:4180',
    ]) {
      expect(isAllowedHost(host), host).toBe(true)
    }
  })

  it('rejects other names, which is what a DNS-rebinding page sends', () => {
    for (const host of ['attacker.example:4180', '127.0.0.1.nip.io', 'localhost.attacker.example', 'a b']) {
      expect(isAllowedHost(host), host).toBe(false)
    }
  })

  it('accepts names from the allowlist, and anything for *', () => {
    expect(isAllowedHost('devbox.lan:4180', ['devbox.lan'])).toBe(true)
    expect(isAllowedHost('DevBox.lan', ['devbox.lan'])).toBe(true)
    expect(isAllowedHost('other.lan', ['devbox.lan'])).toBe(false)
    expect(isAllowedHost('attacker.example', ['*'])).toBe(true)
  })

  it('allows a request without a Host header', () => {
    expect(isAllowedHost(null)).toBe(true)
    expect(isAllowedHost('')).toBe(true)
  })
})

describe('parseAllowedHosts', () => {
  it('splits, trims, lowercases and drops blanks', () => {
    expect(parseAllowedHosts(' DevBox.lan, ,nas.local ')).toEqual(['devbox.lan', 'nas.local'])
    expect(parseAllowedHosts(undefined)).toEqual([])
  })
})
