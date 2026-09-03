import type { NotebookInputCellMetadata, NotebookInputType, NotebookWidgetMetadata } from './types'

/**
 * Adapters between the widget metadata shape stored on a notebook cell and the
 * legacy input-cell shape that InputCellEditor still edits. `toLegacyInputMetadata`
 * fills in the per-type empty value when none is stored; `fromLegacyInputMetadata`
 * keeps the widget's stored defaultValue, which the legacy editor does not manage.
 */
export function toLegacyInputMetadata(metadata: NotebookWidgetMetadata): NotebookInputCellMetadata {
  const widgetType = metadata.widgetType as NotebookInputType
  return {
    key: metadata.key || 'param',
    label: metadata.label || 'Input',
    inputType: widgetType,
    value:
      metadata.value === undefined
        ? widgetType === 'checkbox'
          ? false
          : widgetType === 'number' || widgetType === 'range'
            ? null
            : widgetType === 'multiselect'
              ? []
              : ''
        : (metadata.value as NotebookInputCellMetadata['value']),
    defaultValue:
      metadata.defaultValue === undefined
        ? undefined
        : (metadata.defaultValue as NotebookInputCellMetadata['defaultValue']),
    required: metadata.required,
    placeholder: metadata.placeholder,
    options: metadata.options,
    optionsSource: metadata.config?.optionSource === 'sql' ? 'sql' : 'manual',
    optionsQuery:
      typeof metadata.config?.optionsQuery === 'string' ? metadata.config.optionsQuery : undefined,
    min: metadata.min,
    max: metadata.max,
    step: metadata.step,
    autoRun: metadata.autoRun,
  }
}

export function fromLegacyInputMetadata(
  current: NotebookWidgetMetadata,
  metadata: NotebookInputCellMetadata
): NotebookWidgetMetadata {
  const widgetType = current.widgetType as NotebookInputType
  return {
    widgetType,
    key: metadata.key,
    label: metadata.label,
    value: metadata.value,
    defaultValue: current.defaultValue,
    required: metadata.required,
    placeholder: metadata.placeholder,
    options: metadata.options,
    config:
      widgetType === 'select' || widgetType === 'multiselect'
        ? {
            optionSource: metadata.optionsSource === 'sql' ? 'sql' : 'manual',
            optionsQuery: metadata.optionsQuery?.trim() || undefined,
          }
        : undefined,
    min: metadata.min,
    max: metadata.max,
    step: metadata.step,
    autoRun: metadata.autoRun,
  }
}
