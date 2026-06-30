import { beforeEach, describe, expect, it, vi } from 'vitest'
import fkOptionsHandler from '../pages/api/tables/[table]/fk-options'
import * as db from '../lib/db'

vi.mock('../lib/db', () => ({
  getForeignKeyOptions: vi.fn(async () => ({
    options: [{ value: '42', label: 'Alice', selected: true }],
    truncated: false,
  })),
}))

type ApiResult = {
  statusCode: number
  payload: unknown
}

async function invokeApi(query: Record<string, unknown>): Promise<ApiResult> {
  let statusCode = 200
  let payload: unknown = null

  const req = {
    method: 'GET',
    query: { table: 'orders', ...query },
  }

  const res = {
    setHeader: vi.fn(),
    status(code: number) {
      statusCode = code
      return this
    },
    json(body: unknown) {
      payload = body
      return this
    },
  }

  await fkOptionsHandler(req as never, res as never)
  return { statusCode, payload }
}

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
