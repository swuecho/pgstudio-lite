import { describe, expect, it } from 'vitest'
import {
  createDefaultWidgetMetadata,
  normalizeWidgetMetadata,
  notebookWidgetMetadataSchema,
} from '../lib/notebook-widgets'

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
})
