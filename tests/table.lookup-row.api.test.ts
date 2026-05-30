import { describe, expect, it, vi, beforeEach } from 'vitest'
import lookupRowHandler from '../pages/api/tables/[table]/lookup-row'
import * as db from '../lib/db'

vi.mock('../lib/db', () => ({
  lookupTableRow: vi.fn(async () => ({
    row: { id: 42, name: 'alice' },
    columns: [{ name: 'id', dataType: 'integer', isNullable: false, isIdentity: false, isPrimaryKey: true }],
  })),
}))

type ApiResult = {
  statusCode: number
  payload: unknown
}

async function invokeApi(input: { table?: string; body?: unknown }): Promise<ApiResult> {
  let statusCode = 200
  let payload: unknown = null

  const req = {
    method: 'POST',
    query: { table: input.table || 'users' },
    body: input.body,
  }

  const res = {
    status(code: number) {
      statusCode = code
      return this
    },
    json(body: unknown) {
      payload = body
      return this
    },
  }

  await lookupRowHandler(req as never, res as never)
  return { statusCode, payload }
}

describe('table lookup-row API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls lookupTableRow with schema and match', async () => {
    const result = await invokeApi({
      body: {
        connectionName: 'local',
        schema: 'public',
        match: { id: 42 },
      },
    })

    expect(result.statusCode).toBe(200)
    expect(db.lookupTableRow).toHaveBeenCalledWith('local', 'public', 'users', { id: 42 })
    expect(result.payload).toEqual({
      row: { id: 42, name: 'alice' },
      columns: [
        { name: 'id', dataType: 'integer', isNullable: false, isIdentity: false, isPrimaryKey: true },
      ],
    })
  })

  it('rejects empty match', async () => {
    const result = await invokeApi({
      body: {
        schema: 'public',
        match: {},
      },
    })

    expect(result.statusCode).toBe(400)
    expect(db.lookupTableRow).not.toHaveBeenCalled()
  })

  it('rejects non-POST methods', async () => {
    let statusCode = 200
    const req = { method: 'GET', query: { table: 'users' }, body: {} }
    const res = {
      setHeader: vi.fn(),
      status(code: number) {
        statusCode = code
        return this
      },
      json() {
        return this
      },
    }
    await lookupRowHandler(req as never, res as never)
    expect(statusCode).toBe(405)
  })
})
