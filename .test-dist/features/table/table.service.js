'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.getConnections = getConnections
exports.getTables = getTables
exports.getRows = getRows
exports.patchRow = patchRow
exports.removeRow = removeRow
exports.insertRow = insertRow
const http_1 = require('../../lib/http')
async function getConnections() {
  return (0, http_1.fetchJson)('/api/connections')
}
async function getTables(connectionName) {
  return (0, http_1.fetchJson)(`/api/tables?connectionName=${encodeURIComponent(connectionName)}`)
}
async function getRows(args) {
  const params = new URLSearchParams({
    connectionName: args.connectionName,
    limit: String(args.pageSize),
    offset: String(args.page * args.pageSize),
    sortBy: args.sortBy,
    sortOrder: args.sortOrder,
  })
  if (args.filterColumn && args.filterValue.trim()) {
    params.set('filterColumn', args.filterColumn)
    params.set('filterValue', args.filterValue.trim())
    params.set('filterMode', args.filterMode)
  }
  return (0, http_1.fetchJson)(`/api/tables/${encodeURIComponent(args.table)}/rows?${params.toString()}`)
}
async function patchRow(table, payload) {
  return (0, http_1.fetchJson)(`/api/tables/${encodeURIComponent(table)}/rows`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}
async function removeRow(table, payload) {
  return (0, http_1.fetchJson)(`/api/tables/${encodeURIComponent(table)}/rows`, {
    method: 'DELETE',
    body: JSON.stringify(payload),
  })
}
async function insertRow(table, payload) {
  return (0, http_1.fetchJson)(`/api/tables/${encodeURIComponent(table)}/rows`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
