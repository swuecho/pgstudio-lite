// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { NotebookDashboard } from '../components/notebook/NotebookDashboard'
import type { NotebookPageController } from '../components/notebook/useNotebookPageState'
import type { NotebookCell, NotebookWidgetMetadata } from '../components/notebook/types'
import type { QueryResult } from '../components/sql-editor/types'

function makeCell(id: string, position: number, type: NotebookCell['type'], content = ''): NotebookCell {
  return {
    id,
    notebook_id: 'nb',
    position,
    type,
    content,
    collapsed: false,
    last_run_status: null,
    last_run_at: null,
    last_duration_ms: null,
    last_row_count: null,
    last_result_json: null,
    last_error: null,
    metadata_json: null,
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

function makeResult(params: Array<{ key: string; value: unknown }> = []): QueryResult {
  return {
    statements: [
      {
        command: 'SELECT',
        rowCount: 1,
        returnedRowCount: 1,
        truncated: false,
        fields: ['v'],
        rows: [{ v: 1 }],
      },
    ],
    totalRows: 1,
    durationMs: 3,
    executedQuery: params.length
      ? {
          text: 'select $1',
          values: params.map((param) => param.value),
          params: params.map((param, index) => ({
            key: param.key,
            placeholder: `$${index + 1}`,
            value: param.value,
            valueType: typeof param.value,
            source: 'request' as const,
          })),
        }
      : undefined,
  }
}

const regionWidget: NotebookWidgetMetadata = {
  widgetType: 'text',
  key: 'region',
  label: 'Region',
  value: 'emea',
  defaultValue: 'all',
}
const hiddenWidget: NotebookWidgetMetadata = {
  widgetType: 'text',
  key: 'secret',
  label: 'Secret',
  value: 'x',
  hidden: true,
}
const actionWidget: NotebookWidgetMetadata = {
  widgetType: 'actions',
  label: 'Refresh revenue',
  config: { action: 'run-targets', targetCellIds: ['sql-stale'] },
}
const calloutWidget: NotebookWidgetMetadata = {
  widgetType: 'callout',
  config: { tone: 'info', title: 'Heads up', body: 'Numbers are provisional.' },
}

const cells: NotebookCell[] = [
  makeCell('md', 0, 'markdown', '# Revenue'),
  { ...makeCell('w-region', 1, 'widget'), metadata_json: regionWidget },
  { ...makeCell('w-hidden', 2, 'widget'), metadata_json: hiddenWidget },
  { ...makeCell('w-action', 3, 'widget'), metadata_json: actionWidget },
  { ...makeCell('w-callout', 4, 'widget'), metadata_json: calloutWidget },
  { ...makeCell('sql-fresh', 5, 'sql', 'select 1'), last_run_status: 'success' },
  { ...makeCell('sql-stale', 6, 'sql', 'select {{region}}'), last_run_status: 'success' },
  makeCell('sql-never', 7, 'sql', 'select 3'),
]

function renderDashboard(overrides: Partial<NotebookPageController> = {}) {
  const runAllSqlCells = vi.fn()
  const runTargetSqlCells = vi.fn()
  const updateParameterWidget = vi.fn()
  const resetParameterWidget = vi.fn()
  const controller = {
    activeNotebookId: 'nb',
    sortedCells: cells,
    resultsByCell: {
      'sql-fresh': makeResult(),
      'sql-stale': makeResult([{ key: 'region', value: 'apac' }]),
    },
    draftByCell: {},
    widgetDraftByCell: {
      'w-region': regionWidget,
      'w-hidden': hiddenWidget,
      'w-action': actionWidget,
      'w-callout': calloutWidget,
    },
    paramStaleByCell: { 'sql-stale': true },
    cellUiStateByCell: {},
    runningAll: false,
    runningCellId: '',
    runAllSqlCells,
    runTargetSqlCells,
    updateParameterWidget,
    resetParameterWidget,
    resolvedOptionsByCell: {},
    refreshSqlOptions: vi.fn(),
    validationMessagesByCell: {},
    ...overrides,
  } as unknown as NotebookPageController
  render(<NotebookDashboard controller={controller} />)
  return { runAllSqlCells, runTargetSqlCells, updateParameterWidget, resetParameterWidget }
}

describe('NotebookDashboard', () => {
  it('shows parameter and action widgets as controls, but not hidden ones', () => {
    renderDashboard()
    const controls = screen.getByLabelText('Dashboard controls')
    expect(within(controls).getAllByText('Region').length).toBeGreaterThan(0)
    expect(within(controls).getByRole('button', { name: 'Refresh revenue' })).toBeInTheDocument()
    expect(within(controls).queryByText('Secret')).toBeNull()
    expect(screen.getByText('Heads up')).toBeInTheDocument()
  })

  it('routes a parameter edit and a reset to the controller', () => {
    const { updateParameterWidget, resetParameterWidget } = renderDashboard()

    fireEvent.change(screen.getByDisplayValue('emea'), { target: { value: 'amer' } })
    expect(updateParameterWidget).toHaveBeenCalledTimes(1)
    expect(updateParameterWidget.mock.calls[0][0]).toBe('w-region')
    expect(updateParameterWidget.mock.calls[0][1]).toMatchObject({ key: 'region', value: 'amer' })

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(resetParameterWidget).toHaveBeenCalledWith('w-region')
  })

  it('runs an action widget against its targets', () => {
    const { runTargetSqlCells } = renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh revenue' }))
    expect(runTargetSqlCells).toHaveBeenCalledWith(['sql-stale'])
  })

  it('flags out-of-date and never-run queries and can run just those', () => {
    const { runTargetSqlCells, runAllSqlCells } = renderDashboard()

    expect(screen.getByText('Out of date')).toBeInTheDocument()
    expect(screen.getByText('Not run yet')).toBeInTheDocument()
    expect(screen.getByText('1 out of date', { exact: false })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Run out of date \(2\)/ }))
    expect(runTargetSqlCells).toHaveBeenCalledWith(['sql-stale', 'sql-never'])

    fireEvent.click(screen.getByRole('button', { name: 'Run all' }))
    expect(runAllSqlCells).toHaveBeenCalledTimes(1)
  })

  it('runs a single query from its card', () => {
    const { runTargetSqlCells } = renderDashboard()
    const card = screen.getByText('Query #8').closest('div')!.parentElement!
    fireEvent.click(within(card).getByRole('button', { name: 'Run' }))
    expect(runTargetSqlCells).toHaveBeenCalledWith(['sql-never'])
  })

  it('disables running while a run is in progress', () => {
    renderDashboard({
      runningAll: true,
      cellUiStateByCell: { 'sql-fresh': 'running' },
    } as Partial<NotebookPageController>)
    expect(screen.getByRole('button', { name: 'Running...' })).toBeDisabled()
    expect(screen.getAllByText('Running...').length).toBeGreaterThan(1)
  })
})
