import { describe, expect, it } from 'vitest'
import { fromLegacyInputMetadata, toLegacyInputMetadata } from '../components/notebook/widgetInputAdapters'
import type { NotebookWidgetMetadata } from '../components/notebook/types'

describe('widget input adapters', () => {
  it('fills the per-type empty value when the widget has none stored', () => {
    expect(toLegacyInputMetadata({ widgetType: 'text', key: 'q' }).value).toBe('')
    expect(toLegacyInputMetadata({ widgetType: 'number', key: 'n' }).value).toBeNull()
    expect(toLegacyInputMetadata({ widgetType: 'range', key: 'r' }).value).toBeNull()
    expect(toLegacyInputMetadata({ widgetType: 'checkbox', key: 'c' }).value).toBe(false)
    expect(toLegacyInputMetadata({ widgetType: 'multiselect', key: 'm' }).value).toEqual([])
  })

  it('maps select option sourcing in both directions', () => {
    const widget: NotebookWidgetMetadata = {
      widgetType: 'select',
      key: 'status',
      label: 'Status',
      value: 'open',
      defaultValue: 'open',
      options: [{ label: 'Open', value: 'open' }],
      config: { optionSource: 'sql', optionsQuery: 'select 1 as value, 1 as label' },
      autoRun: true,
    }
    const legacy = toLegacyInputMetadata(widget)
    expect(legacy).toMatchObject({
      inputType: 'select',
      optionsSource: 'sql',
      optionsQuery: 'select 1 as value, 1 as label',
    })

    const roundTripped = fromLegacyInputMetadata(widget, { ...legacy, optionsQuery: '  ' })
    expect(roundTripped.config).toEqual({ optionSource: 'sql', optionsQuery: undefined })
  })

  it('keeps the stored defaultValue and drops config for non-option widgets', () => {
    const widget: NotebookWidgetMetadata = {
      widgetType: 'number',
      key: 'limit',
      label: 'Limit',
      value: 10,
      defaultValue: 25,
      min: 0,
      max: 100,
    }
    const next = fromLegacyInputMetadata(widget, {
      ...toLegacyInputMetadata(widget),
      value: 50,
      defaultValue: 999,
      label: 'Row limit',
    })
    expect(next).toEqual({
      widgetType: 'number',
      key: 'limit',
      label: 'Row limit',
      value: 50,
      defaultValue: 25,
      required: undefined,
      placeholder: undefined,
      options: undefined,
      config: undefined,
      min: 0,
      max: 100,
      step: undefined,
      autoRun: undefined,
    })
  })
})
