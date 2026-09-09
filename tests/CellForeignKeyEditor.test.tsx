// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CellForeignKeyEditor } from '../components/table-editor/CellForeignKeyEditor'
import type { ColumnInfo, RowData } from '../components/table-editor/types'
import { getForeignKeyOptions, saveForeignKeyDisplayConfig } from '../features/table/table.service'

vi.mock('../features/table/table.service', () => ({
  getForeignKeyOptions: vi.fn(),
  saveForeignKeyDisplayConfig: vi.fn(),
}))

const routerPush = vi.fn()
vi.mock('next/router', () => ({
  default: { push: (...args: unknown[]) => routerPush(...args) },
}))

const userColumn: ColumnInfo = {
  name: 'user_id',
  dataType: 'uuid',
  isNullable: true,
  isIdentity: false,
  isPrimaryKey: false,
  foreignKey: {
    constraintName: 'accounts_user_id_fkey',
    referencedSchema: 'public',
    referencedTable: 'users',
    referencedColumn: 'id',
    constraintColumns: ['user_id'],
    constraintReferencedColumns: ['id'],
  },
}

const row: RowData = {
  _rowKey: { id: 1 },
  id: 1,
  user_id: null,
}

describe('CellForeignKeyEditor', () => {
  beforeEach(() => {
    routerPush.mockReset()
    vi.mocked(getForeignKeyOptions).mockReset()
    vi.mocked(saveForeignKeyDisplayConfig).mockReset()
    vi.mocked(getForeignKeyOptions).mockResolvedValue({
      options: [{ value: 'u-1', label: 'Adam King' }],
      truncated: false,
    })
    vi.mocked(saveForeignKeyDisplayConfig).mockResolvedValue({
      config: {
        connectionName: 'local',
        schema: 'public',
        table: 'users',
        displayColumns: ['email'],
        displayTemplate: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    })
  })

  it('jumps to the referenced row on ⌘/Ctrl+click instead of opening the picker', async () => {
    const onCommit = vi.fn(() => 'pending' as const)
    render(
      <CellForeignKeyEditor
        connectionName="local"
        column={userColumn}
        row={{ ...row, user_id: 'u-1' }}
        onCommit={onCommit}
      />
    )

    const button = await screen.findByRole('button', { name: /Adam King/i })
    expect(button).toHaveAttribute('title', expect.stringContaining('Ctrl+click'))
    fireEvent.click(button, { metaKey: true })

    expect(routerPush).toHaveBeenCalledWith({
      pathname: '/table-editor',
      query: {
        connectionName: 'local',
        schema: 'public',
        table: 'users',
        filterColumn: 'id',
        filterMode: 'equals',
        filterValue: 'u-1',
      },
    })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('opens the picker on a plain click of a NULL FK cell instead of jumping', () => {
    const onCommit = vi.fn(() => 'pending' as const)
    render(<CellForeignKeyEditor connectionName="local" column={userColumn} row={row} onCommit={onCommit} />)

    fireEvent.click(screen.getByRole('button', { name: /null/i }), { metaKey: true })
    expect(routerPush).not.toHaveBeenCalled()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('opens a picker from a compact FK cell and commits selected values explicitly', async () => {
    const onCommit = vi.fn(() => 'pending' as const)
    render(<CellForeignKeyEditor connectionName="local" column={userColumn} row={row} onCommit={onCommit} />)

    fireEvent.click(screen.getByRole('button', { name: /null/i }))

    await waitFor(() => {
      expect(getForeignKeyOptions).toHaveBeenCalledWith({
        connectionName: 'local',
        schema: 'public',
        table: 'users',
        column: 'id',
        search: '',
        limit: 50,
        selectedValue: '',
      })
    })
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    const option = await screen.findByRole('option', { name: /Adam King/i })
    fireEvent.mouseDown(option)

    expect(onCommit).toHaveBeenCalledWith(row, 'user_id', 'u-1', 'uuid', expect.any(Function))
    expect(screen.getByRole('button', { name: /Adam King/i })).toBeInTheDocument()
    expect(screen.getByText('u-1')).toBeInTheDocument()
  })

  it('requests the current FK value so it can be pinned first', async () => {
    vi.mocked(getForeignKeyOptions).mockResolvedValue({
      options: [
        { value: 'u-2', label: 'Current User', selected: true },
        { value: 'u-1', label: 'Adam King' },
      ],
      truncated: false,
    })
    const onCommit = vi.fn(() => 'pending' as const)
    render(
      <CellForeignKeyEditor
        connectionName="local"
        column={userColumn}
        row={{ ...row, user_id: 'u-2' }}
        onCommit={onCommit}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'u-2' }))

    await waitFor(() => {
      expect(getForeignKeyOptions).toHaveBeenCalledWith(expect.objectContaining({ selectedValue: 'u-2' }))
    })
    expect(await screen.findByRole('option', { name: /Current User/i })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByText('Current value')).toBeInTheDocument()
  })

  it('shows a trace shortcut for the referenced row in the picker', async () => {
    vi.mocked(getForeignKeyOptions).mockResolvedValue({
      options: [{ value: 'u-4', label: 'Traceable User', selected: true }],
      truncated: false,
    })
    const onCommit = vi.fn(() => 'pending' as const)
    render(
      <CellForeignKeyEditor
        connectionName="local"
        column={userColumn}
        row={{ ...row, user_id: 'u-4' }}
        onCommit={onCommit}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: /Traceable User/i }))

    const traceLink = screen.getByRole('link', { name: 'Trace' })
    expect(traceLink).toHaveAttribute(
      'href',
      `/trace?connectionName=local&schema=public&table=users&pk=${encodeURIComponent(JSON.stringify({ id: 'u-4' }))}`
    )
  })

  it('shows an open-table shortcut for the referenced FK row', async () => {
    vi.mocked(getForeignKeyOptions).mockResolvedValue({
      options: [{ value: 'u-7', label: 'Openable User', selected: true }],
      truncated: false,
    })
    const onCommit = vi.fn(() => 'pending' as const)
    render(
      <CellForeignKeyEditor
        connectionName="local"
        column={userColumn}
        row={{ ...row, user_id: 'u-7' }}
        onCommit={onCommit}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: /Openable User/i }))

    const openLink = screen.getByRole('link', { name: 'Open' })
    expect(openLink).toHaveAttribute(
      'href',
      '/table-editor?connectionName=local&schema=public&table=users&filterColumn=id&filterMode=equals&filterValue=u-7'
    )
  })

  it('keeps the popover mounted when pressing the trace shortcut', async () => {
    vi.mocked(getForeignKeyOptions).mockResolvedValue({
      options: [{ value: 'u-5', label: 'Traceable User', selected: true }],
      truncated: false,
    })
    const onCommit = vi.fn(() => 'pending' as const)
    render(
      <CellForeignKeyEditor
        connectionName="local"
        column={userColumn}
        row={{ ...row, user_id: 'u-5' }}
        onCommit={onCommit}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: /Traceable User/i }))
    const traceLink = screen.getByRole('link', { name: 'Trace' })
    fireEvent.mouseDown(traceLink)

    expect(screen.getByRole('link', { name: 'Trace' })).toBeInTheDocument()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('omits the trace shortcut when the FK value is empty', async () => {
    const onCommit = vi.fn(() => 'pending' as const)
    render(<CellForeignKeyEditor connectionName="local" column={userColumn} row={row} onCommit={onCommit} />)

    fireEvent.click(screen.getByRole('button', { name: /null/i }))

    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: 'Trace' })).not.toBeInTheDocument()
  })

  it('shows an open-table shortcut when the FK value is empty', async () => {
    const onCommit = vi.fn(() => 'pending' as const)
    render(<CellForeignKeyEditor connectionName="local" column={userColumn} row={row} onCommit={onCommit} />)

    fireEvent.click(screen.getByRole('button', { name: /null/i }))

    const openLink = await screen.findByRole('link', { name: 'Open' })
    expect(openLink).toHaveAttribute('href', '/table-editor?connectionName=local&schema=public&table=users')
  })

  it('resolves and displays the FK label before editing', async () => {
    vi.mocked(getForeignKeyOptions).mockResolvedValue({
      options: [{ value: 'u-3', label: 'Resolved User', selected: true }],
      truncated: false,
    })
    const onCommit = vi.fn(() => 'pending' as const)
    render(
      <CellForeignKeyEditor
        connectionName="local"
        column={userColumn}
        row={{ ...row, user_id: 'u-3' }}
        onCommit={onCommit}
      />
    )

    expect(await screen.findByRole('button', { name: /Resolved User/i })).toBeInTheDocument()
    expect(screen.getByText('u-3')).toBeInTheDocument()
    expect(getForeignKeyOptions).toHaveBeenCalledWith(
      expect.objectContaining({ selectedValue: 'u-3', limit: 1 })
    )
  })

  it('refreshes the displayed cell label after changing the label column', async () => {
    let useEmailLabel = false
    vi.mocked(getForeignKeyOptions).mockImplementation(async () => ({
      options: [{ value: 'u-6', label: useEmailLabel ? 'user@example.com' : 'User Name', selected: true }],
      truncated: false,
      labelColumn: useEmailLabel ? 'email' : 'name',
      labelColumnSource: useEmailLabel ? 'configured' : 'heuristic',
      availableLabelColumns: [
        { name: 'name', selected: !useEmailLabel, source: useEmailLabel ? 'heuristic' : 'heuristic' },
        { name: 'email', selected: useEmailLabel, source: useEmailLabel ? 'configured' : 'none' },
      ],
    }))
    vi.mocked(saveForeignKeyDisplayConfig).mockImplementation(async () => {
      useEmailLabel = true
      return {
        config: {
          connectionName: 'local',
          schema: 'public',
          table: 'users',
          displayColumns: ['email'],
          displayTemplate: null,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      }
    })
    const onCommit = vi.fn(() => 'pending' as const)
    render(
      <CellForeignKeyEditor
        connectionName="local"
        column={userColumn}
        row={{ ...row, user_id: 'u-6' }}
        onCommit={onCommit}
      />
    )

    expect(await screen.findByRole('button', { name: /User Name/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /User Name/i }))
    fireEvent.change(await screen.findByTitle('Choose the display column for this referenced table'), {
      target: { value: 'email' },
    })

    await waitFor(() => {
      expect(saveForeignKeyDisplayConfig).toHaveBeenCalledWith({
        connectionName: 'local',
        schema: 'public',
        table: 'users',
        displayColumns: ['email'],
      })
    })
    expect(await screen.findByRole('button', { name: /user@example.com/i })).toBeInTheDocument()
  })

  it('keeps only one FK cell editor open at a time', async () => {
    const onCommit = vi.fn(() => 'pending' as const)
    render(
      <>
        <CellForeignKeyEditor
          connectionName="local"
          column={userColumn}
          row={{ ...row, _rowKey: { id: 1 }, user_id: 'x-1' }}
          onCommit={onCommit}
        />
        <CellForeignKeyEditor
          connectionName="local"
          column={userColumn}
          row={{ ...row, _rowKey: { id: 2 }, user_id: 'x-2' }}
          onCommit={onCommit}
        />
      </>
    )

    fireEvent.mouseDown(screen.getByRole('button', { name: 'x-1' }))
    fireEvent.click(screen.getByRole('button', { name: 'x-1' }))
    expect(screen.getByRole('combobox')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'x-2' }))
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'x-1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'x-2' })).toHaveAttribute('aria-expanded', 'true')
  })
})
