import { describe, expect, it } from 'vitest'
import {
  createWidgetMetadataFromPreset,
  createDefaultWidgetMetadata,
  normalizeWidgetMetadata,
  notebookWidgetMetadataSchema,
} from '../lib/notebook-widgets'
import { mapQueryResultToOptions } from '../lib/notebook-option-source'

describe('notebook widgets', () => {
  it('accepts a valid radio-group widget', () => {
    const result = notebookWidgetMetadataSchema.safeParse({
      widgetType: 'radio-group',
      key: 'status',
      label: 'Status',
      value: 'open',
      options: [
        { label: 'Open', value: 'open' },
        { label: 'Closed', value: 'closed' },
      ],
    })

    expect(result.success).toBe(true)
  })

  it('rejects radio-group without options', () => {
    const result = notebookWidgetMetadataSchema.safeParse({
      widgetType: 'radio-group',
      key: 'status',
      label: 'Status',
    })

    expect(result.success).toBe(false)
  })

  it('accepts a select widget with sql-backed options', () => {
    const result = notebookWidgetMetadataSchema.safeParse({
      widgetType: 'select',
      key: 'status',
      label: 'Status',
      value: '',
      config: {
        optionSource: 'sql',
        optionsQuery: 'select id as value, name as label from statuses',
      },
    })

    expect(result.success).toBe(true)
  })

  it('rejects a sql-backed select widget without query text', () => {
    const result = notebookWidgetMetadataSchema.safeParse({
      widgetType: 'select',
      key: 'status',
      label: 'Status',
      value: '',
      config: {
        optionSource: 'sql',
        optionsQuery: '   ',
      },
    })

    expect(result.success).toBe(false)
  })

  it('accepts a valid date-range widget', () => {
    const result = notebookWidgetMetadataSchema.safeParse({
      widgetType: 'date-range',
      label: 'Date Range',
      value: { start: '2026-01-01', end: '2026-01-31' },
      config: { startKey: 'start_date', endKey: 'end_date' },
    })

    expect(result.success).toBe(true)
  })

  it('rejects date-range with duplicate keys', () => {
    const result = notebookWidgetMetadataSchema.safeParse({
      widgetType: 'date-range',
      label: 'Date Range',
      config: { startKey: 'date_key', endKey: 'date_key' },
    })

    expect(result.success).toBe(false)
  })

  it('rejects run-targets actions widget without targets', () => {
    const result = notebookWidgetMetadataSchema.safeParse({
      widgetType: 'actions',
      label: 'Run Selection',
      config: { action: 'run-targets', targetCellIds: [] },
    })

    expect(result.success).toBe(false)
  })

  it('accepts a callout widget with body only', () => {
    const result = notebookWidgetMetadataSchema.safeParse({
      widgetType: 'callout',
      config: { body: 'Remember to filter by tenant.' },
    })

    expect(result.success).toBe(true)
  })

  it('normalizes widget defaults and trims text', () => {
    const normalized = normalizeWidgetMetadata({
      widgetType: 'callout',
      config: { tone: 'info', title: ' Note ', body: ' body ' },
    })

    expect(normalized).toMatchObject({
      widgetType: 'callout',
      config: { tone: 'info', title: 'Note', body: 'body' },
    })
  })

  it('creates default widget metadata', () => {
    const metadata = createDefaultWidgetMetadata('actions')

    expect(metadata).toMatchObject({
      widgetType: 'actions',
      config: { action: 'run-all' },
    })
  })

  it('creates the status select preset with manual options', () => {
    const metadata = createWidgetMetadataFromPreset('status-select')

    expect(metadata).toMatchObject({
      widgetType: 'select',
      key: 'status',
      label: 'Status',
      config: { optionSource: 'manual' },
    })
    expect(metadata.options?.map((item) => item.value)).toEqual(['all', 'open', 'closed'])
  })

  it('creates the sql select preset with a starter query', () => {
    const metadata = createWidgetMetadataFromPreset('sql-select')

    expect(metadata).toMatchObject({
      widgetType: 'select',
      key: 'entity_id',
      config: {
        optionSource: 'sql',
        optionsQuery: 'select id as value, name as label from my_table order by 2;',
      },
    })
  })

  it('maps option query result rows into widget options', () => {
    const options = mapQueryResultToOptions({
      statements: [
        {
          command: 'SELECT',
          rowCount: 2,
          returnedRowCount: 2,
          truncated: false,
          fields: ['id', 'name'],
          rows: [
            { id: 'open', name: 'Open' },
            { id: 'closed', name: 'Closed' },
          ],
        },
      ],
      totalRows: 2,
      durationMs: 2,
    })

    expect(options).toEqual([
      { value: 'open', label: 'Open' },
      { value: 'closed', label: 'Closed' },
    ])
  })
})
