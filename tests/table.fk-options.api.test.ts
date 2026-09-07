import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invokeApi as callApi } from './helpers/invoke-api'
import fkOptionsHandler from '../pages/api/tables/[table]/fk-options'
import * as db from '../lib/db'

vi.mock('../lib/db', () => ({
  getForeignKeyOptions: vi.fn(async () => ({
    options: [{ value: '42', label: 'Alice', selected: true }],
    truncated: false,
  })),
}))

const invokeApi = (query: Record<string, unknown>) =>
  callApi(fkOptionsHandler, { query: { table: 'orders', ...query } })

describe('table fk-options API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards selectedValue to FK options lookup', async () => {
    const result = await invokeApi({
      connectionName: 'local',
      schema: 'public',
      column: 'user_id',
      search: 'ali',
      selectedValue: '42',
      limit: '25',
    })

    expect(result.statusCode).toBe(200)
    expect(db.getForeignKeyOptions).toHaveBeenCalledWith(
      'local',
      'public',
      'orders',
      'user_id',
      'ali',
      25,
      '42'
    )
    expect(result.payload).toEqual({
      options: [{ value: '42', label: 'Alice', selected: true }],
      truncated: false,
    })
  })
})
