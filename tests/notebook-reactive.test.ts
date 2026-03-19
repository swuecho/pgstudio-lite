import { describe, expect, it } from 'vitest'
import type { NotebookCell, NotebookWidgetMetadata } from '../components/notebook/types'
import { getChangedWidgetParamKeys } from '../components/notebook/useNotebookCellState'
import { buildInputValues, getDependentSqlTargets, runReactiveSqlCells, type ReactiveNotebookState } from '../lib/notebook-reactive'

function makeCell(partial: Partial<NotebookCell>): NotebookCell {
  return {
    id: partial.id || 'cell',
    notebook_id: partial.notebook_id || 'nb-1',
    position: partial.position ?? 0,
    type: partial.type || 'sql',
    content: partial.content || '',
    collapsed: partial.collapsed ?? false,
    last_run_status: partial.last_run_status ?? null,
    last_run_at: partial.last_run_at ?? null,
    last_duration_ms: partial.last_duration_ms ?? null,
    last_row_count: partial.last_row_count ?? null,
    last_result_json: partial.last_result_json ?? null,
    last_error: partial.last_error ?? null,
    metadata_json: partial.metadata_json ?? null,
    updated_at: partial.updated_at || new Date().toISOString(),
  }
}

function makeWidgetMetadata(partial: Partial<NotebookWidgetMetadata>): NotebookWidgetMetadata {
  return {
    widgetType: partial.widgetType || 'radio-group',
    ...partial,
  } as NotebookWidgetMetadata
}

describe('notebook reactive runner', () => {
  it('uses latest widget state between dependent SQL executions', async () => {
    const widgetCell = makeCell({
      id: 'w-1',
      type: 'widget',
      position: 0,
      metadata_json: makeWidgetMetadata({ widgetType: 'number', key: 'p', label: 'Param', value: 5, autoRun: true }),
    })
    const sql1 = makeCell({ id: 'sql-1', type: 'sql', position: 1, content: 'select {{p}} as v1' })
    const sql2 = makeCell({ id: 'sql-2', type: 'sql', position: 2, content: 'select {{p}} as v2' })

    const state: ReactiveNotebookState = {
      activeNotebookId: 'nb-1',
      runningAll: false,
      runningCellId: '',
      sortedCells: [widgetCell, sql1, sql2],
      draftByCell: {
        'sql-1': 'select {{p}} as v1',
        'sql-2': 'select {{p}} as v2',
      },
      widgetDraftByCell: {
        'w-1': makeWidgetMetadata({ widgetType: 'number', key: 'p', label: 'Param', value: 5, autoRun: true }),
      },
    }

    const seenValues: number[] = []

    await runReactiveSqlCells({
      inputCellId: 'w-1',
      inputKey: 'p',
      getState: () => state,
      runCell: async ({ cellId, inputValues }) => {
        seenValues.push(Number(inputValues.p))
        if (cellId === 'sql-1') {
          state.widgetDraftByCell['w-1'] = makeWidgetMetadata({ widgetType: 'number', key: 'p', label: 'Param', value: 6, autoRun: true })
        }
      },
    })

    expect(seenValues).toEqual([5, 6])
  })

  it('only targets SQL cells below the source widget cell', () => {
    const widgetCell = makeCell({
      id: 'w-1',
      type: 'widget',
      position: 2,
      metadata_json: makeWidgetMetadata({ widgetType: 'number', key: 'p', label: 'Param', value: 1, autoRun: true }),
    })
    const sqlAbove = makeCell({ id: 'sql-above', type: 'sql', position: 1, content: 'select {{p}}' })
    const sqlBelow = makeCell({ id: 'sql-below', type: 'sql', position: 3, content: 'select {{p}}' })

    const targets = getDependentSqlTargets(
      {
        activeNotebookId: 'nb-1',
        runningAll: false,
        runningCellId: '',
        sortedCells: [sqlAbove, widgetCell, sqlBelow],
        draftByCell: {
          'sql-above': 'select {{p}}',
          'sql-below': 'select {{p}}',
        },
        widgetDraftByCell: {
          'w-1': makeWidgetMetadata({ widgetType: 'number', key: 'p', label: 'Param', value: 1, autoRun: true }),
        },
      },
      'w-1',
      'p'
    )

    expect(targets.map((cell) => cell.id)).toEqual(['sql-below'])
  })

  it('skips execution when another cell is already running', async () => {
    const widgetCell = makeCell({
      id: 'w-1',
      type: 'widget',
      position: 0,
      metadata_json: makeWidgetMetadata({ widgetType: 'number', key: 'p', label: 'Param', value: 5, autoRun: true }),
    })
    const sql1 = makeCell({ id: 'sql-1', type: 'sql', position: 1, content: 'select {{p}} as v1' })

    let callCount = 0

    await runReactiveSqlCells({
      inputCellId: 'w-1',
      inputKey: 'p',
      getState: () => ({
        activeNotebookId: 'nb-1',
        runningAll: false,
        runningCellId: 'sql-existing',
        sortedCells: [widgetCell, sql1],
        draftByCell: { 'sql-1': 'select {{p}} as v1' },
        widgetDraftByCell: {
          'w-1': makeWidgetMetadata({ widgetType: 'number', key: 'p', label: 'Param', value: 5, autoRun: true }),
        },
      }),
      runCell: async () => {
        callCount += 1
      },
    })

    expect(callCount).toBe(0)
  })

  it('includes widget-derived params in built input values', () => {
    const radioWidget = makeCell({
      id: 'w-1',
      type: 'widget',
      position: 0,
      metadata_json: makeWidgetMetadata({
        widgetType: 'radio-group',
        key: 'status',
        label: 'Status',
        value: 'open',
        options: [
          { label: 'Open', value: 'open' },
          { label: 'Closed', value: 'closed' },
        ],
      }),
    })
    const dateRangeWidget = makeCell({
      id: 'w-2',
      type: 'widget',
      position: 1,
      metadata_json: makeWidgetMetadata({
        widgetType: 'date-range',
        label: 'Date Range',
        value: { start: '2026-01-01', end: '2026-01-31' },
        config: { startKey: 'start_date', endKey: 'end_date' },
      }),
    })

    expect(buildInputValues([radioWidget, dateRangeWidget])).toEqual({
      status: 'open',
      start_date: '2026-01-01',
      end_date: '2026-01-31',
    })
  })

  it('tracks renamed and updated widget params for reactive reruns', () => {
    const previous = makeWidgetMetadata({
      widgetType: 'date-range',
      label: 'Date Range',
      value: { start: '2026-01-01', end: '2026-01-31' },
      config: { startKey: 'start_date', endKey: 'end_date' },
    })
    const next = makeWidgetMetadata({
      widgetType: 'date-range',
      label: 'Date Range',
      value: { start: '2026-02-01', end: '2026-02-29' },
      config: { startKey: 'from_date', endKey: 'end_date' },
    })

    expect(getChangedWidgetParamKeys(previous, next).sort()).toEqual(['end_date', 'from_date', 'start_date'])
  })
})
