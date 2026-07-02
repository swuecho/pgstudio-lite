import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateTourNotebook } from '../lib/tour-generator'
import { getTableColumns, getTableForeignKeys, listTables } from '../lib/db'

vi.mock('../lib/db', () => ({
  listTables: vi.fn(),
  getTableColumns: vi.fn(),
  getTableForeignKeys: vi.fn(),
}))

describe('generateTourNotebook', () => {
  beforeEach(() => {
    vi.mocked(listTables).mockReset()
    vi.mocked(getTableColumns).mockReset()
    vi.mocked(getTableForeignKeys).mockReset()
    vi.mocked(getTableColumns).mockResolvedValue([
      {
        name: 'id',
        dataType: 'integer',
        isNullable: false,
        isIdentity: false,
        isPrimaryKey: true,
        hasDefault: false,
      },
    ])
    vi.mocked(getTableForeignKeys).mockResolvedValue([])
  })

  it('does not fall back to other schemas for an explicit schema request', async () => {
    vi.mocked(listTables).mockResolvedValue({
      truncated: false,
      tables: [{ schema: 'analytics', table: 'events', estimatedRows: 10, kind: 'table' }],
    })

    const notebook = await generateTourNotebook({ connectionName: 'local', schema: 'sales' })

    expect(notebook.cells).toHaveLength(1)
    expect(notebook.cells[0].content).toContain('**0** relations in schema `sales`')
    expect(getTableColumns).not.toHaveBeenCalled()
  })

  it('falls back across non-system schemas when public has no tables by default', async () => {
    vi.mocked(listTables).mockResolvedValue({
      truncated: false,
      tables: [{ schema: 'analytics', table: 'events', estimatedRows: 10, kind: 'table' }],
    })

    const notebook = await generateTourNotebook({ connectionName: 'local' })

    expect(notebook.title).toContain('Tour: all schemas')
    expect(notebook.cells[0].content).toContain('**1** relation across non-system schemas')
    expect(notebook.cells.some((cell) => cell.content.includes('analytics.events'))).toBe(true)
  })

  it('escapes markdown table metacharacters in column summaries', async () => {
    vi.mocked(listTables).mockResolvedValue({
      truncated: false,
      tables: [{ schema: 'public', table: 'weird_columns', estimatedRows: 1, kind: 'table' }],
    })
    vi.mocked(getTableColumns).mockResolvedValue([
      {
        name: 'a|b`c',
        dataType: 'USER-DEFINED|custom',
        isNullable: true,
        isIdentity: false,
        isPrimaryKey: false,
        hasDefault: false,
      },
    ])

    const notebook = await generateTourNotebook({ connectionName: 'local' })

    expect(notebook.cells[1].content).toContain('| `a\\|b\\`c` | USER-DEFINED\\|custom | YES |  |')
  })
})
