import { describe, expect, it } from 'vitest'
import type { NotebookCell, NotebookInputCellMetadata } from '../components/notebook/types'
import { getDependentSqlTargets, runReactiveSqlCells, type ReactiveNotebookState } from '../lib/notebook-reactive'

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

function makeInputMetadata(value: unknown): NotebookInputCellMetadata {
  return {
    key: 'p',
    label: 'Param',
    inputType: 'number',
    value: value as number,
    autoRun: true,
  }
}

describe('notebook reactive runner', () => {
  it('uses latest input state between dependent SQL executions (stale-state regression)', async () => {
    const inputCell = makeCell({ id: 'in-1', type: 'input', position: 0, metadata_json: makeInputMetadata(5) })
    const sql1 = makeCell({ id: 'sql-1', type: 'sql', position: 1, content: 'select {{p}} as v1' })
    const sql2 = makeCell({ id: 'sql-2', type: 'sql', position: 2, content: 'select {{p}} as v2' })

    const state: ReactiveNotebookState = {
      activeNotebookId: 'nb-1',
      runningAll: false,
      runningCellId: '',
      sortedCells: [inputCell, sql1, sql2],
      draftByCell: {
        'sql-1': 'select {{p}} as v1',
        'sql-2': 'select {{p}} as v2',
      },
      inputDraftByCell: {
        'in-1': makeInputMetadata(5),
      },
    }

    const seenValues: number[] = []

    await runReactiveSqlCells({
      inputCellId: 'in-1',
      inputKey: 'p',
      getState: () => state,
      runCell: async ({ cellId, inputValues }) => {
        seenValues.push(Number(inputValues.p))
        if (cellId === 'sql-1') {
          state.inputDraftByCell['in-1'] = makeInputMetadata(6)
        }
      },
    })

    expect(seenValues).toEqual([5, 6])
  })

  it('only targets SQL cells below the source input cell', () => {
    const inputCell = makeCell({ id: 'in-1', type: 'input', position: 2, metadata_json: makeInputMetadata(1) })
    const sqlAbove = makeCell({ id: 'sql-above', type: 'sql', position: 1, content: 'select {{p}}' })
    const sqlBelow = makeCell({ id: 'sql-below', type: 'sql', position: 3, content: 'select {{p}}' })

    const targets = getDependentSqlTargets(
      {
        activeNotebookId: 'nb-1',
        runningAll: false,
        runningCellId: '',
        sortedCells: [sqlAbove, inputCell, sqlBelow],
        draftByCell: {
          'sql-above': 'select {{p}}',
          'sql-below': 'select {{p}}',
        },
        inputDraftByCell: { 'in-1': makeInputMetadata(1) },
      },
      'in-1',
      'p'
    )

    expect(targets.map((cell) => cell.id)).toEqual(['sql-below'])
  })

  it('skips execution when another cell is already running', async () => {
    const inputCell = makeCell({ id: 'in-1', type: 'input', position: 0, metadata_json: makeInputMetadata(5) })
    const sql1 = makeCell({ id: 'sql-1', type: 'sql', position: 1, content: 'select {{p}} as v1' })

    let callCount = 0

    await runReactiveSqlCells({
      inputCellId: 'in-1',
      inputKey: 'p',
      getState: () => ({
        activeNotebookId: 'nb-1',
        runningAll: false,
        runningCellId: 'sql-existing',
        sortedCells: [inputCell, sql1],
        draftByCell: { 'sql-1': 'select {{p}} as v1' },
        inputDraftByCell: { 'in-1': makeInputMetadata(5) },
      }),
      runCell: async () => {
        callCount += 1
      },
    })

    expect(callCount).toBe(0)
  })
})
