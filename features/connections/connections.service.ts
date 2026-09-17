import { fetchJson } from '@/lib/http'
import type { ConnectionColorId } from '@/lib/connection-color'

export type ConnectionItem = {
  id: string
  name: string
  isDefault: boolean
  readOnly: boolean
  color: ConnectionColorId | null
}

export async function listConnections() {
  return fetchJson<{
    connections: ConnectionItem[]
    configured: boolean
    defaultConnectionName: string | null
  }>('/api/connections')
}

export async function createConnection(input: {
  name: string
  connectionString: string
  isDefault?: boolean
  readOnly?: boolean
  color?: ConnectionColorId | null
}) {
  return fetchJson<{ item: ConnectionItem }>('/api/connections', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateConnection(input: {
  id: string
  name?: string
  connectionString?: string
  isDefault?: boolean
  readOnly?: boolean
  color?: ConnectionColorId | null
}) {
  return fetchJson<{ item: ConnectionItem }>('/api/connections', {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function setDefaultConnection(id: string) {
  return fetchJson<{ item: ConnectionItem }>('/api/connections', {
    method: 'PATCH',
    body: JSON.stringify({ id, setDefault: true }),
  })
}

export async function deleteConnection(id: string) {
  return fetchJson<{ ok: boolean }>('/api/connections', {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  })
}
