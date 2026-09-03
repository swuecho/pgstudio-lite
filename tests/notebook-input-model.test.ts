import { describe, expect, it } from 'vitest'
import type { NotebookCell, NotebookWidgetMetadata } from '../components/notebook/types'
import {
  getInputCellIdByKey,
  getNotebookInputs,
  getParameterWidgets,
  getValidationMessagesByCell,
} from '../components/notebook/notebookInputModel'

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

const textWidget: NotebookWidgetMetadata = { widgetType: 'text', key: 'q', label: 'Search', value: '' }
const radioWidget: NotebookWidgetMetadata = {
  widgetType: 'radio-group',
  key: 'status',
  label: 'Status',
  value: 'open',
  options: [{ label: 'Open', value: 'open' }],
}
const rangeWidget: NotebookWidgetMetadata = {
  widgetType: 'date-range',
  label: 'Created',
  value: { start: '', end: '' },
  config: { startKey: 'created_from', endKey: ' created_to ' },
}
const keylessWidget: NotebookWidgetMetadata = { widgetType: 'number', label: 'Orphan', value: null }
const callout: NotebookWidgetMetadata = { widgetType: 'callout', config: { tone: 'info', title: 'Note' } }

const cells = [
  makeCell({ id: 'w-text', type: 'widget', position: 0 }),
  makeCell({ id: 'w-radio', type: 'widget', position: 1 }),
  makeCell({ id: 'w-range', type: 'widget', position: 2 }),
  makeCell({ id: 'w-keyless', type: 'widget', position: 3 }),
  makeCell({ id: 'w-callout', type: 'widget', position: 4 }),
  makeCell({ id: 'w-nodraft', type: 'widget', position: 5 }),
  makeCell({ id: 'sql-1', type: 'sql', position: 6, content: 'select * from t where q = {{q}}' }),
  makeCell({ id: 'sql-2', type: 'sql', position: 7, content: 'select 1' }),
]
const widgetDraftByCell: Record<string, NotebookWidgetMetadata> = {
  'w-text': textWidget,
  'w-radio': radioWidget,
  'w-range': rangeWidget,
  'w-keyless': keylessWidget,
  'w-callout': callout,
}

describe('notebook input model', () => {
  it('lists one input per parameter key, in cell order, skipping keyless and non-parameter widgets', () => {
    expect(getNotebookInputs(cells, widgetDraftByCell)).toEqual([
      { cellId: 'w-text', key: 'q', label: 'Search', inputType: 'text' },
      { cellId: 'w-radio', key: 'status', label: 'Status', inputType: 'widget-radio' },
      { cellId: 'w-range', key: 'created_from', label: 'Created Start', inputType: 'widget-date' },
      { cellId: 'w-range', key: 'created_to', label: 'Created End', inputType: 'widget-date' },
    ])
  })

  it('maps every parameter key, including both date-range keys, back to its cell', () => {
    expect(getInputCellIdByKey(cells, widgetDraftByCell)).toEqual({
      q: 'w-text',
      status: 'w-radio',
      created_from: 'w-range',
      created_to: 'w-range',
    })
  })

  it('flags a parameter key shared by two widgets on both of them, on the right field', () => {
    const dup = [
      makeCell({ id: 'a', type: 'widget', position: 0 }),
      makeCell({ id: 'b', type: 'widget', position: 1 }),
      makeCell({ id: 'c', type: 'widget', position: 2 }),
    ]
    const drafts: Record<string, NotebookWidgetMetadata> = {
      a: { ...textWidget, key: 'shared' },
      b: { ...radioWidget, key: 'shared' },
      c: { ...rangeWidget, config: { startKey: 'shared', endKey: 'unique_end' } },
    }
    const out = getValidationMessagesByCell(dup, drafts)
    const message = "Parameter key 'shared' is already used by another widget"
    expect(out.a.key).toEqual([message])
    expect(out.b.key).toEqual([message])
    expect(out.c.startKey).toEqual([message])
    expect(out.c.endKey).toBeUndefined()
  })

  it('reports no duplicate message when keys are unique and metadata is valid', () => {
    const out = getValidationMessagesByCell(cells, widgetDraftByCell)
    expect(out['w-text']).toEqual({})
    expect(out['w-radio']).toEqual({})
    expect(out['w-callout']).toEqual({})
    expect(out['w-nodraft']).toBeUndefined()
  })

  it('builds parameter widgets with usage computed from the SQL draft over saved content', () => {
    const validationMessagesByCell = getValidationMessagesByCell(cells, widgetDraftByCell)
    const widgets = getParameterWidgets({
      sortedCells: cells,
      widgetDraftByCell,
      draftByCell: { 'sql-2': 'select * from t where status = {{status}}' },
      validationMessagesByCell,
    })

    expect(widgets.map((item) => item.cell.id)).toEqual(['w-text', 'w-radio', 'w-range'])

    const [text, radio, range] = widgets
    expect(text).toMatchObject({
      primaryKey: 'q',
      parameterKeys: ['q'],
      source: 'manual',
      usedByCellIds: ['sql-1'],
    })
    expect(radio.usedByCellIds).toEqual(['sql-2'])
    expect(range).toMatchObject({
      parameterKeys: ['created_from', 'created_to'],
      primaryKey: 'created_from',
      usedByCellIds: [],
      validationCount: 0,
    })
  })

  it('marks a widget as sql-sourced from its option source config', () => {
    const sqlSelect: NotebookWidgetMetadata = {
      widgetType: 'select',
      key: 'region',
      label: 'Region',
      value: '',
      options: [],
      config: { optionSource: 'sql', optionsQuery: 'select name as value, name as label from regions' },
    }
    const [widget] = getParameterWidgets({
      sortedCells: [makeCell({ id: 'w', type: 'widget' })],
      widgetDraftByCell: { w: sqlSelect },
      draftByCell: {},
      validationMessagesByCell: {},
    })
    expect(widget.source).toBe('sql')
  })
})
