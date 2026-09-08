import { describe, expect, it } from 'vitest'
import type { NotebookCell, NotebookWidgetMetadata } from '../components/notebook/types'
import {
  clearPendingSaveCell,
  clearSaveError,
  getCellUiStateByCell,
  getStaleResultByCell,
  getPendingSaveEntries,
  getChangedWidgetParamKeys,
  getPendingSaveCount,
  syncExecutedQueryState,
  syncCellResultState,
  syncCellDraftState,
  syncWidgetDraftState,
  getParamStaleByCell,
} from '../components/notebook/cellSyncHelpers'
import {
  buildInputValues,
  getDependentSqlTargets,
  getDependentSqlTargetsForInputKeys,
  runReactiveSqlCells,
  type ReactiveNotebookState,
} from '../lib/notebook-reactive'

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
      metadata_json: makeWidgetMetadata({
        widgetType: 'number',
        key: 'p',
        label: 'Param',
        value: 5,
        autoRun: true,
      }),
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
        'w-1': makeWidgetMetadata({
          widgetType: 'number',
          key: 'p',
          label: 'Param',
          value: 5,
          autoRun: true,
        }),
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
          state.widgetDraftByCell['w-1'] = makeWidgetMetadata({
            widgetType: 'number',
            key: 'p',
            label: 'Param',
            value: 6,
            autoRun: true,
          })
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
      metadata_json: makeWidgetMetadata({
        widgetType: 'number',
        key: 'p',
        label: 'Param',
        value: 1,
        autoRun: true,
      }),
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
          'w-1': makeWidgetMetadata({
            widgetType: 'number',
            key: 'p',
            label: 'Param',
            value: 1,
            autoRun: true,
          }),
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
      metadata_json: makeWidgetMetadata({
        widgetType: 'number',
        key: 'p',
        label: 'Param',
        value: 5,
        autoRun: true,
      }),
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
          'w-1': makeWidgetMetadata({
            widgetType: 'number',
            key: 'p',
            label: 'Param',
            value: 5,
            autoRun: true,
          }),
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

  it('maps a widget edit to dependent SQL reruns with updated values', () => {
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
      config: { startKey: 'start_date', endKey: 'end_date' },
    })
    const widgetCell = makeCell({ id: 'w-1', type: 'widget', position: 1, metadata_json: previous })
    const sqlAbove = makeCell({ id: 'sql-above', type: 'sql', position: 0, content: 'select {{start_date}}' })
    const sqlStart = makeCell({ id: 'sql-start', type: 'sql', position: 2, content: 'select {{start_date}}' })
    const sqlEnd = makeCell({ id: 'sql-end', type: 'sql', position: 3, content: 'select {{end_date}}' })
    const sqlBoth = makeCell({
      id: 'sql-both',
      type: 'sql',
      position: 4,
      content: 'select {{start_date}}, {{end_date}}',
    })

    const state: ReactiveNotebookState = {
      activeNotebookId: 'nb-1',
      runningAll: false,
      runningCellId: '',
      sortedCells: [sqlAbove, widgetCell, sqlStart, sqlEnd, sqlBoth],
      draftByCell: {
        'sql-above': 'select {{start_date}}',
        'sql-start': 'select {{start_date}}',
        'sql-end': 'select {{end_date}}',
        'sql-both': 'select {{start_date}}, {{end_date}}',
      },
      widgetDraftByCell: {
        'w-1': next,
      },
    }

    const changedKeys = getChangedWidgetParamKeys(previous, next)
    const targets = getDependentSqlTargetsForInputKeys(state, 'w-1', changedKeys)

    expect(changedKeys.sort()).toEqual(['end_date', 'start_date'])
    expect(targets.map((cell) => cell.id)).toEqual(['sql-start', 'sql-end', 'sql-both'])
    expect(buildInputValues(state.sortedCells, state.widgetDraftByCell)).toMatchObject({
      start_date: '2026-02-01',
      end_date: '2026-02-29',
    })
  })

  it('refreshes cell drafts when server content changes and there is no local edit', () => {
    const synced = syncCellDraftState({
      cells: [makeCell({ id: 'sql-1', type: 'sql', content: 'select 2;' })],
      previousDrafts: { 'sql-1': 'select 1;' },
      previousServerContent: { 'sql-1': 'select 1;' },
      pendingSavePayloads: {},
    })

    expect(synced.drafts['sql-1']).toBe('select 2;')
  })

  it('preserves cell drafts when a local edit is still pending save', () => {
    const synced = syncCellDraftState({
      cells: [makeCell({ id: 'sql-1', type: 'sql', content: 'select 2;' })],
      previousDrafts: { 'sql-1': 'select 1 where local = true;' },
      previousServerContent: { 'sql-1': 'select 1;' },
      pendingSavePayloads: { 'sql-1': { content: 'select 1 where local = true;' } },
    })

    expect(synced.drafts['sql-1']).toBe('select 1 where local = true;')
  })

  it('counts only active pending saves', () => {
    expect(getPendingSaveCount({ a: true, b: false, c: true })).toBe(2)
  })

  it('clears one pending save without mutating unrelated entries', () => {
    expect(clearPendingSaveCell({ a: true, b: true }, 'a')).toEqual({ b: true })
  })

  it('captures pending save payload entries for flush execution', () => {
    expect(
      getPendingSaveEntries({
        a: { content: 'select 1;' },
        b: { metadata: makeWidgetMetadata({ widgetType: 'text', key: 'q', value: 'abc' }) },
      })
    ).toEqual([
      { cellId: 'a', payload: { content: 'select 1;' } },
      {
        cellId: 'b',
        payload: { metadata: makeWidgetMetadata({ widgetType: 'text', key: 'q', value: 'abc' }) },
      },
    ])
  })

  it('refreshes widget drafts when server metadata changes and there is no local edit', () => {
    const synced = syncWidgetDraftState({
      cells: [
        makeCell({
          id: 'w-1',
          type: 'widget',
          metadata_json: makeWidgetMetadata({
            widgetType: 'text',
            key: 'region',
            label: 'Region',
            value: 'eu',
          }),
        }),
      ],
      previousDrafts: {
        'w-1': makeWidgetMetadata({ widgetType: 'text', key: 'region', label: 'Region', value: 'us' }),
      },
      previousServerMetadata: {
        'w-1': makeWidgetMetadata({ widgetType: 'text', key: 'region', label: 'Region', value: 'us' }),
      },
      pendingSavePayloads: {},
    })

    expect(synced.drafts['w-1']).toMatchObject({
      widgetType: 'text',
      key: 'region',
      label: 'Region',
      value: 'eu',
    })
  })

  it('preserves widget drafts when a local metadata edit is still pending save', () => {
    const localDraft = makeWidgetMetadata({
      widgetType: 'text',
      key: 'region',
      label: 'Region',
      value: 'apac',
    })

    const synced = syncWidgetDraftState({
      cells: [
        makeCell({
          id: 'w-1',
          type: 'widget',
          metadata_json: makeWidgetMetadata({
            widgetType: 'text',
            key: 'region',
            label: 'Region',
            value: 'eu',
          }),
        }),
      ],
      previousDrafts: { 'w-1': localDraft },
      previousServerMetadata: {
        'w-1': makeWidgetMetadata({ widgetType: 'text', key: 'region', label: 'Region', value: 'us' }),
      },
      pendingSavePayloads: { 'w-1': { metadata: localDraft } },
    })

    expect(synced.drafts['w-1']).toEqual(localDraft)
  })

  it('refreshes cached SQL results when server results change and local cache matches the previous server state', () => {
    const previousResult = {
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
      durationMs: 5,
    }
    const nextResult = {
      statements: [
        {
          command: 'SELECT',
          rowCount: 1,
          returnedRowCount: 1,
          truncated: false,
          fields: ['v'],
          rows: [{ v: 2 }],
        },
      ],
      totalRows: 1,
      durationMs: 6,
    }

    const synced = syncCellResultState({
      cells: [
        makeCell({
          id: 'sql-1',
          type: 'sql',
          last_result_json: nextResult,
        }),
      ],
      previousResults: {
        'sql-1': previousResult,
      },
      previousServerResults: {
        'sql-1': previousResult,
      },
    })

    expect(synced.results['sql-1']).toEqual(nextResult)
  })

  it('refreshes executed query baselines from server-backed SQL results', () => {
    const synced = syncExecutedQueryState({
      cells: [
        makeCell({
          id: 'sql-1',
          type: 'sql',
          content: 'select 2;',
          last_result_json: {
            statements: [
              {
                command: 'SELECT',
                rowCount: 1,
                returnedRowCount: 1,
                truncated: false,
                fields: ['v'],
                rows: [{ v: 2 }],
              },
            ],
            totalRows: 1,
            durationMs: 5,
          },
        }),
      ],
      previousExecutedQueryByCell: { 'sql-1': 'select 1;' },
      previousServerExecutedQueryByCell: { 'sql-1': 'select 1;' },
    })

    expect(synced.executedQueryByCell['sql-1']).toBe('select 2;')
  })

  it('marks results stale when the current SQL draft differs from the last executed query', () => {
    const stale = getStaleResultByCell({
      sortedCells: [makeCell({ id: 'sql-1', type: 'sql', content: 'select 2;' })],
      draftByCell: { 'sql-1': 'select 3;' },
      resultsByCell: {
        'sql-1': {
          statements: [
            {
              command: 'SELECT',
              rowCount: 1,
              returnedRowCount: 1,
              truncated: false,
              fields: ['v'],
              rows: [{ v: 2 }],
            },
          ],
          totalRows: 1,
          durationMs: 5,
        },
      },
      lastExecutedQueryByCell: { 'sql-1': 'select 2;' },
    })

    expect(stale['sql-1']).toBe(true)
  })

  it('derives per-cell ui state with the correct priority order', () => {
    const cells = [
      makeCell({ id: 'sql-running', type: 'sql' }),
      makeCell({ id: 'sql-saving', type: 'sql' }),
      makeCell({ id: 'sql-queued', type: 'sql' }),
      makeCell({ id: 'sql-stale', type: 'sql' }),
      makeCell({ id: 'sql-idle', type: 'sql' }),
    ]

    const states = getCellUiStateByCell({
      sortedCells: cells,
      pendingSaveByCell: { 'sql-saving': true, 'sql-running': true },
      saveErrorByCell: { 'sql-stale': 'disk full', 'sql-idle': 'retry later' },
      queuedRunByCell: { 'sql-queued': true, 'sql-saving': true },
      runningCellId: 'sql-running',
      staleResultByCell: { 'sql-stale': true, 'sql-queued': true },
    })

    expect(states).toEqual({
      'sql-running': 'running',
      'sql-saving': 'saving',
      'sql-queued': 'queued',
      'sql-stale': 'save_failed',
      'sql-idle': 'save_failed',
    })
  })

  it('clears a save error without affecting other cells', () => {
    expect(clearSaveError({ a: 'boom', b: 'retry' }, 'a')).toEqual({ b: 'retry' })
  })

  it('marks a result out of date when a bound parameter no longer matches the current inputs', () => {
    const cells = [
      { id: 'a', type: 'sql' },
      { id: 'b', type: 'sql' },
      { id: 'c', type: 'sql' },
      { id: 'w', type: 'widget' },
    ] as any
    const withParams = (params: Array<{ key: string; value: unknown }>) =>
      ({
        statements: [],
        totalRows: 0,
        durationMs: 0,
        executedQuery: {
          text: '',
          values: params.map((p) => p.value),
          params: params.map((p, i) => ({
            ...p,
            placeholder: `$${i + 1}`,
            valueType: typeof p.value,
            source: 'request',
          })),
        },
      }) as any

    const stale = getParamStaleByCell({
      sortedCells: cells,
      resultsByCell: {
        a: withParams([
          { key: 'region', value: 'emea' },
          { key: 'ids', value: ['1', '2'] },
        ]),
        b: withParams([{ key: 'region', value: 'apac' }]),
        c: { statements: [], totalRows: 0, durationMs: 0 } as any,
      },
      inputValues: { region: 'emea', ids: ['1', '2'] },
    })

    expect(stale).toEqual({ a: false, b: true })
  })
})
