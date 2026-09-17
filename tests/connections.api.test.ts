import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invokeApi as callApi, type ApiCall } from './helpers/invoke-api'
import connectionsHandler from '../pages/api/connections'
import { createConnection, getPublicConnections, updateConnection } from '../lib/db'

vi.mock('../lib/db', () => ({
  createConnection: vi.fn(),
  deleteConnection: vi.fn(),
  getPublicConnections: vi.fn(),
  setDefaultConnection: vi.fn(),
  updateConnection: vi.fn(),
}))

const invokeApi = (call: ApiCall) => callApi(connectionsHandler, call)

const sample = {
  id: 'c1',
  name: 'prod',
  isDefault: true,
  readOnly: false,
  color: 'red' as const,
}

describe('connections API colors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the color with each connection', async () => {
    vi.mocked(getPublicConnections).mockReturnValue([sample])
    const res = await invokeApi({ method: 'GET' })

    expect(res.statusCode).toBe(200)
    expect((res.payload as any).connections[0].color).toBe('red')
  })

  it('accepts a palette color on create', async () => {
    vi.mocked(createConnection).mockReturnValue({ ...sample, connectionString: 'x' } as never)
    const res = await invokeApi({
      method: 'POST',
      body: { name: 'prod', connectionString: 'postgres://p', color: 'red' },
    })

    expect(res.statusCode).toBe(200)
    expect(vi.mocked(createConnection).mock.calls[0][0]).toMatchObject({ color: 'red' })
    expect((res.payload as any).item.color).toBe('red')
  })

  it('rejects a color outside the palette', async () => {
    const res = await invokeApi({
      method: 'POST',
      body: { name: 'prod', connectionString: 'postgres://p', color: 'chartreuse' },
    })

    expect(res.statusCode).toBe(400)
    expect(createConnection).not.toHaveBeenCalled()
  })

  it('clears a color with an explicit null', async () => {
    vi.mocked(updateConnection).mockReturnValue({ ...sample, color: null, connectionString: 'x' } as never)
    const res = await invokeApi({ method: 'PATCH', body: { id: 'c1', color: null } })

    expect(res.statusCode).toBe(200)
    expect(vi.mocked(updateConnection).mock.calls[0][1]).toMatchObject({ color: null })
    expect((res.payload as any).item.color).toBeNull()
  })
})
