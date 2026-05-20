'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.fetchJson = fetchJson
async function fetchJson(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`)
  return body
}
