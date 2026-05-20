'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.getConnections = getConnections
exports.runQuery = runQuery
exports.getHistory = getHistory
exports.clearHistory = clearHistory
exports.getSnippets = getSnippets
exports.createSnippet = createSnippet
exports.updateSnippet = updateSnippet
exports.deleteSnippet = deleteSnippet
exports.getSchema = getSchema
exports.getSchemaColumns = getSchemaColumns
const http_1 = require('../../lib/http')
async function getConnections() {
  return (0, http_1.fetchJson)('/api/connections')
}
async function runQuery(connectionName, query) {
  return (0, http_1.fetchJson)('/api/query', {
    method: 'POST',
    body: JSON.stringify({ connectionName, query }),
  })
}
async function getHistory(limit = 300) {
  return (0, http_1.fetchJson)(`/api/history?limit=${limit}`)
}
async function clearHistory() {
  return (0, http_1.fetchJson)('/api/history', { method: 'DELETE' })
}
async function getSnippets(limit = 300) {
  return (0, http_1.fetchJson)(`/api/snippets?limit=${limit}`)
}
async function createSnippet(title, queryText) {
  return (0, http_1.fetchJson)('/api/snippets', {
    method: 'POST',
    body: JSON.stringify({ title, queryText }),
  })
}
async function updateSnippet(id, payload) {
  return (0, http_1.fetchJson)('/api/snippets', {
    method: 'PATCH',
    body: JSON.stringify({ id, ...payload }),
  })
}
async function deleteSnippet(id) {
  return (0, http_1.fetchJson)('/api/snippets', {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  })
}
async function getSchema(connectionName) {
  return (0, http_1.fetchJson)(`/api/schema?connectionName=${encodeURIComponent(connectionName)}`)
}
async function getSchemaColumns(connectionName, schema, table) {
  return (0, http_1.fetchJson)(
    `/api/schema/columns?connectionName=${encodeURIComponent(connectionName)}&schema=${encodeURIComponent(schema)}&table=${encodeURIComponent(table)}`
  )
}
