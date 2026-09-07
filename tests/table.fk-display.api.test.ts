import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invokeApi as callApi, type ApiCall } from './helpers/invoke-api'
import fkDisplayHandler from '../pages/api/tables/[table]/fk-display'
import * as db from '../lib/db'

vi.mock('../lib/db', () => ({
  getForeignKeyDisplayConfig: vi.fn(() => ({
    connectionName: 'local',
    schema: 'public',
    table: 'users',
    displayColumns: ['email'],
    displayTemplate: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  })),
  getTableColumns: vi.fn(async () => [
    { name: 'id', dataType: 'uuid', isNullable: false, isIdentity: false, isPrimaryKey: true },
    { name: 'email', dataType: 'text', isNullable: false, isIdentity: false, isPrimaryKey: false },
    { name: 'full_name', dataType: 'text', isNullable: true, isIdentity: false, isPrimaryKey: false },
  ]),
  saveForeignKeyDisplayConfig: vi.fn((input) => ({
    connectionName: input.connectionName,
    schema: input.schema,
    table: input.table,
    displayColumns: input.displayColumns,
    displayTemplate: input.displayTemplate ?? null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  })),
}))

const invokeApi = (call: ApiCall) =>
  callApi(fkDisplayHandler, { ...call, query: { table: 'users', ...(call.query || {}) } })

describe('table fk-display API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns saved FK display config', async () => {
    const result = await invokeApi({
      method: 'GET',
      query: { connectionName: 'local', schema: 'public' },
    })

    expect(result.statusCode).toBe(200)
    expect(db.getForeignKeyDisplayConfig).toHaveBeenCalledWith({
      connectionName: 'local',
      schema: 'public',
      table: 'users',
    })
    expect(result.payload).toMatchObject({ config: { displayColumns: ['email'] } })
  })

  it('validates and saves FK display columns', async () => {
    const result = await invokeApi({
      method: 'PATCH',
      body: { connectionName: 'local', schema: 'public', displayColumns: ['full_name'] },
    })

    expect(result.statusCode).toBe(200)
    expect(db.getTableColumns).toHaveBeenCalledWith('local', 'users', 'public')
    expect(db.saveForeignKeyDisplayConfig).toHaveBeenCalledWith({
      connectionName: 'local',
      schema: 'public',
      table: 'users',
      displayColumns: ['full_name'],
      displayTemplate: null,
    })
    expect(result.payload).toMatchObject({ config: { displayColumns: ['full_name'] } })
  })

  it('rejects unknown display columns', async () => {
    const result = await invokeApi({
      method: 'PATCH',
      body: { connectionName: 'local', schema: 'public', displayColumns: ['missing'] },
    })

    expect(result.statusCode).toBe(400)
    expect(db.saveForeignKeyDisplayConfig).not.toHaveBeenCalled()
  })
})
