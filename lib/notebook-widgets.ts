import { z } from 'zod'

export const notebookParamKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/

export const notebookWidgetTypeSchema = z.enum([
  'text',
  'number',
  'date',
  'datetime-local',
  'checkbox',
  'select',
  'range',
  'multiselect',
  'radio-group',
  'date-range',
  'actions',
  'callout',
])

export const notebookWidgetOptionSchema = z.object({
  label: z.string().trim().min(1),
  value: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
})

const notebookOptionSourceSchema = z.enum(['manual', 'sql'])

const widgetBaseSchema = z.object({
  key: z.string().trim().regex(notebookParamKeyPattern).optional(),
  label: z.string().trim().min(1).optional(),
  helpText: z.string().trim().min(1).optional(),
  autoRun: z.boolean().optional(),
  hidden: z.boolean().optional(),
  disabled: z.boolean().optional(),
  required: z.boolean().optional(),
  placeholder: z.string().trim().optional(),
  value: z.unknown().optional(),
  defaultValue: z.unknown().optional(),
  options: z.array(notebookWidgetOptionSchema).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})

const dateRangeValueSchema = z.object({
  start: z.string(),
  end: z.string(),
})

const inputLikeWidgetTypeSchema = z.enum([
  'text',
  'number',
  'date',
  'datetime-local',
  'checkbox',
  'select',
  'range',
  'multiselect',
])

const inputLikeWidgetSchema = widgetBaseSchema
  .extend({
    widgetType: inputLikeWidgetTypeSchema,
  })
  .superRefine((value, ctx) => {
    if (!value.key) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['key'], message: 'key is required' })
    }
    if (!value.label) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['label'], message: 'label is required' })
    }
    if (value.widgetType === 'select' || value.widgetType === 'multiselect') {
      const optionSource = notebookOptionSourceSchema.catch('manual').parse(value.config?.optionSource)
      if (optionSource === 'sql') {
        const optionsQuery =
          typeof value.config?.optionsQuery === 'string' ? value.config.optionsQuery.trim() : ''
        if (!optionsQuery) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['config', 'optionsQuery'],
            message: 'optionsQuery is required',
          })
        }
      } else if (!value.options?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options'],
          message: 'at least one option is required',
        })
      }
    }
    if (value.widgetType === 'checkbox') {
      const parsedValue = value.value === undefined ? { success: true } : z.boolean().safeParse(value.value)
      if (!parsedValue.success)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'value must be a boolean' })
    } else if (value.widgetType === 'number' || value.widgetType === 'range') {
      const parsedValue =
        value.value === undefined ? { success: true } : z.union([z.number(), z.null()]).safeParse(value.value)
      if (!parsedValue.success)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value'],
          message: 'value must be a number or null',
        })
    } else if (value.widgetType === 'multiselect') {
      const parsedValue =
        value.value === undefined ? { success: true } : z.array(z.string()).safeParse(value.value)
      if (!parsedValue.success)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value'],
          message: 'value must be a string array',
        })
    } else {
      const parsedValue = value.value === undefined ? { success: true } : z.string().safeParse(value.value)
      if (!parsedValue.success)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'value must be a string' })
    }
  })

const radioGroupWidgetSchema = widgetBaseSchema
  .extend({
    widgetType: z.literal('radio-group'),
  })
  .superRefine((value, ctx) => {
    if (!value.key) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['key'], message: 'key is required' })
    }
    if (!value.label) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['label'], message: 'label is required' })
    }
    if (!value.options?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'at least one option is required',
      })
    }
    const parsedValue = value.value === undefined ? { success: true } : z.string().safeParse(value.value)
    if (!parsedValue.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'value must be a string' })
    }
    const parsedDefault =
      value.defaultValue === undefined ? { success: true } : z.string().safeParse(value.defaultValue)
    if (!parsedDefault.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['defaultValue'],
        message: 'defaultValue must be a string',
      })
    }
  })

const dateRangeWidgetSchema = widgetBaseSchema
  .extend({
    widgetType: z.literal('date-range'),
  })
  .superRefine((value, ctx) => {
    const startKey = typeof value.config?.startKey === 'string' ? value.config.startKey.trim() : ''
    const endKey = typeof value.config?.endKey === 'string' ? value.config.endKey.trim() : ''
    if (!startKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config', 'startKey'],
        message: 'startKey is required',
      })
    } else if (!notebookParamKeyPattern.test(startKey)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['config', 'startKey'], message: 'invalid startKey' })
    }
    if (!endKey) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['config', 'endKey'], message: 'endKey is required' })
    } else if (!notebookParamKeyPattern.test(endKey)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['config', 'endKey'], message: 'invalid endKey' })
    }
    if (startKey && endKey && startKey === endKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config', 'endKey'],
        message: 'endKey must differ from startKey',
      })
    }
    const parsedValue =
      value.value === undefined ? { success: true } : dateRangeValueSchema.safeParse(value.value)
    if (!parsedValue.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'value must be an object with start and end',
      })
    }
    const parsedDefault =
      value.defaultValue === undefined
        ? { success: true }
        : dateRangeValueSchema.safeParse(value.defaultValue)
    if (!parsedDefault.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['defaultValue'],
        message: 'defaultValue must be an object with start and end',
      })
    }
  })

const actionsWidgetSchema = widgetBaseSchema
  .extend({
    widgetType: z.literal('actions'),
  })
  .superRefine((value, ctx) => {
    if (value.key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['key'],
        message: 'actions widgets cannot define a key',
      })
    }
    const action = value.config?.action
    if (action !== 'run-all' && action !== 'run-targets') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config', 'action'],
        message: 'action must be run-all or run-targets',
      })
    }
    if (action === 'run-targets') {
      const targetCellIds = Array.isArray(value.config?.targetCellIds) ? value.config.targetCellIds : []
      if (!targetCellIds.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['config', 'targetCellIds'],
          message: 'targetCellIds is required for run-targets',
        })
      }
    }
  })

const calloutWidgetSchema = widgetBaseSchema
  .extend({
    widgetType: z.literal('callout'),
  })
  .superRefine((value, ctx) => {
    if (value.key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['key'],
        message: 'callout widgets cannot define a key',
      })
    }
    const title = typeof value.config?.title === 'string' ? value.config.title.trim() : ''
    const body = typeof value.config?.body === 'string' ? value.config.body.trim() : ''
    if (!title && !body) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config'],
        message: 'callout requires a title or body',
      })
    }
  })

export const notebookWidgetMetadataSchema = z.discriminatedUnion('widgetType', [
  inputLikeWidgetSchema,
  radioGroupWidgetSchema,
  dateRangeWidgetSchema,
  actionsWidgetSchema,
  calloutWidgetSchema,
])

export type NotebookWidgetType = z.infer<typeof notebookWidgetTypeSchema>
export type NotebookInputLikeWidgetType = z.infer<typeof inputLikeWidgetTypeSchema>
export type NotebookInputLikeWidgetMetadata = Extract<
  NotebookWidgetMetadata,
  { widgetType: NotebookInputLikeWidgetType }
>
export type NotebookWidgetOption = z.infer<typeof notebookWidgetOptionSchema>
export type NotebookWidgetMetadata = z.infer<typeof notebookWidgetMetadataSchema>
export type NotebookWidgetPresetId =
  | 'text-search'
  | 'status-select'
  | 'sql-select'
  | 'date-range-last-7'
  | 'numeric-range'

export const NOTEBOOK_WIDGET_PRESETS: Array<{
  id: NotebookWidgetPresetId
  label: string
  description: string
}> = [
  { id: 'text-search', label: 'Search Text', description: 'Free-text search parameter' },
  { id: 'status-select', label: 'Status Select', description: 'Common status dropdown with fixed options' },
  { id: 'sql-select', label: 'SQL Select', description: 'Query-backed select widget template' },
  {
    id: 'date-range-last-7',
    label: 'Last 7 Days',
    description: 'Date range preset with last-7-days default',
  },
  { id: 'numeric-range', label: 'Numeric Slider', description: 'Range slider with min/max/step defaults' },
]

export function isWidgetMetadata(value: unknown): value is NotebookWidgetMetadata {
  return notebookWidgetMetadataSchema.safeParse(value).success
}

/** True for the single-value parameter widgets that share the input-like schema. */
export function isInputLikeWidgetType(
  widgetType: NotebookWidgetType
): widgetType is NotebookInputLikeWidgetType {
  return (inputLikeWidgetTypeSchema.options as readonly string[]).includes(widgetType)
}

/** Same test, but narrows the whole metadata object to the input-like member. */
export function isInputLikeWidget(
  metadata: NotebookWidgetMetadata
): metadata is NotebookInputLikeWidgetMetadata {
  return isInputLikeWidgetType(metadata.widgetType)
}

function trimIfString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value
}

export function createDefaultWidgetMetadata(widgetType: NotebookWidgetType): NotebookWidgetMetadata {
  if (isInputLikeWidgetType(widgetType)) {
    const defaultValue =
      widgetType === 'checkbox'
        ? false
        : widgetType === 'number' || widgetType === 'range'
          ? null
          : widgetType === 'multiselect'
            ? []
            : ''
    return {
      widgetType,
      key: `param_${Math.random().toString(36).slice(2, 8)}`,
      label: 'Input',
      autoRun: true,
      value: defaultValue,
      defaultValue,
      options:
        widgetType === 'select' || widgetType === 'multiselect'
          ? [{ label: 'Option 1', value: 'option_1' }]
          : undefined,
      config:
        widgetType === 'select' || widgetType === 'multiselect' ? { optionSource: 'manual' } : undefined,
    }
  }
  if (widgetType === 'radio-group') {
    return {
      widgetType,
      key: 'status',
      label: 'Status',
      autoRun: true,
      value: 'open',
      options: [
        { label: 'Open', value: 'open' },
        { label: 'Closed', value: 'closed' },
      ],
    }
  }
  if (widgetType === 'date-range') {
    return {
      widgetType,
      label: 'Date Range',
      autoRun: true,
      value: { start: '', end: '' },
      config: { startKey: 'start_date', endKey: 'end_date' },
    }
  }
  if (widgetType === 'actions') {
    return {
      widgetType,
      label: 'Run Queries',
      config: { action: 'run-all', targetCellIds: [] },
    }
  }
  return {
    widgetType: 'callout',
    config: { tone: 'info', title: 'Note', body: '' },
  }
}

export function createWidgetMetadataFromPreset(presetId: NotebookWidgetPresetId): NotebookWidgetMetadata {
  if (presetId === 'text-search') {
    return normalizeWidgetMetadata({
      widgetType: 'text',
      key: 'search_term',
      label: 'Search',
      placeholder: 'Type to filter results',
      value: '',
      defaultValue: '',
      autoRun: true,
    })
  }

  if (presetId === 'status-select') {
    return normalizeWidgetMetadata({
      widgetType: 'select',
      key: 'status',
      label: 'Status',
      value: '',
      defaultValue: '',
      autoRun: true,
      options: [
        { label: 'All', value: 'all' },
        { label: 'Open', value: 'open' },
        { label: 'Closed', value: 'closed' },
      ],
      config: { optionSource: 'manual' },
    })
  }

  if (presetId === 'sql-select') {
    return normalizeWidgetMetadata({
      widgetType: 'select',
      key: 'entity_id',
      label: 'Entity',
      value: '',
      defaultValue: '',
      autoRun: true,
      config: {
        optionSource: 'sql',
        optionsQuery: 'select id as value, name as label from my_table order by 2;',
      },
    })
  }

  if (presetId === 'date-range-last-7') {
    const end = formatDateOffset(0)
    const start = formatDateOffset(-6)
    return normalizeWidgetMetadata({
      widgetType: 'date-range',
      label: 'Date Range',
      autoRun: true,
      value: { start, end },
      defaultValue: { start, end },
      config: { startKey: 'start_date', endKey: 'end_date' },
    })
  }

  return normalizeWidgetMetadata({
    widgetType: 'range',
    key: 'limit',
    label: 'Limit',
    min: 1,
    max: 100,
    step: 1,
    value: 25,
    defaultValue: 25,
    autoRun: true,
  })
}

export function normalizeWidgetMetadata(input: NotebookWidgetMetadata): NotebookWidgetMetadata {
  const parsed = notebookWidgetMetadataSchema.parse(input)

  if (isInputLikeWidget(parsed)) {
    let value = parsed.value
    let defaultValue = parsed.defaultValue
    if (parsed.widgetType === 'checkbox') value = Boolean(parsed.value)
    else if (parsed.widgetType === 'number' || parsed.widgetType === 'range') {
      value =
        parsed.value === '' || parsed.value === undefined
          ? null
          : parsed.value === null
            ? null
            : Number(parsed.value)
    } else if (parsed.widgetType === 'multiselect') {
      value = Array.isArray(parsed.value) ? parsed.value.map((item) => String(item)) : []
    } else {
      value = parsed.value === undefined || parsed.value === null ? '' : String(parsed.value)
    }

    if (parsed.widgetType === 'checkbox')
      defaultValue = parsed.defaultValue === undefined ? false : Boolean(parsed.defaultValue)
    else if (parsed.widgetType === 'number' || parsed.widgetType === 'range') {
      defaultValue =
        parsed.defaultValue === '' || parsed.defaultValue === undefined
          ? null
          : parsed.defaultValue === null
            ? null
            : Number(parsed.defaultValue)
    } else if (parsed.widgetType === 'multiselect') {
      defaultValue = Array.isArray(parsed.defaultValue) ? parsed.defaultValue.map((item) => String(item)) : []
    } else {
      defaultValue =
        parsed.defaultValue === undefined || parsed.defaultValue === null ? '' : String(parsed.defaultValue)
    }

    return {
      widgetType: parsed.widgetType,
      key: parsed.key?.trim(),
      label: parsed.label?.trim() || 'Input',
      helpText: parsed.helpText?.trim() || undefined,
      autoRun: parsed.autoRun !== false,
      hidden: parsed.hidden === true || undefined,
      disabled: parsed.disabled === true || undefined,
      required: parsed.required === true || undefined,
      placeholder: parsed.placeholder?.trim() || undefined,
      value,
      defaultValue,
      options:
        parsed.widgetType === 'select' || parsed.widgetType === 'multiselect'
          ? (parsed.options || []).map((option) => ({
              label: option.label.trim(),
              value: option.value.trim(),
              description: option.description?.trim() || undefined,
            }))
          : undefined,
      config:
        parsed.widgetType === 'select' || parsed.widgetType === 'multiselect'
          ? {
              optionSource: notebookOptionSourceSchema.catch('manual').parse(parsed.config?.optionSource),
              optionsQuery:
                typeof parsed.config?.optionsQuery === 'string'
                  ? parsed.config.optionsQuery.trim() || undefined
                  : undefined,
            }
          : undefined,
      min: parsed.min,
      max: parsed.max,
      step: parsed.step,
    }
  }

  if (parsed.widgetType === 'radio-group') {
    const options = (parsed.options || []).map((option) => ({
      label: option.label.trim(),
      value: option.value.trim(),
      description: option.description?.trim() || undefined,
    }))
    const nextValue =
      typeof parsed.value === 'string'
        ? parsed.value
        : typeof parsed.defaultValue === 'string'
          ? parsed.defaultValue
          : options[0]?.value || ''
    return {
      widgetType: 'radio-group',
      key: parsed.key?.trim(),
      label: parsed.label?.trim(),
      helpText: parsed.helpText?.trim() || undefined,
      autoRun: parsed.autoRun !== false,
      hidden: parsed.hidden === true || undefined,
      disabled: parsed.disabled === true || undefined,
      required: parsed.required === true || undefined,
      placeholder: parsed.placeholder?.trim() || undefined,
      value: nextValue,
      defaultValue:
        typeof parsed.defaultValue === 'string' ? parsed.defaultValue : options[0]?.value || nextValue,
      options,
      min: parsed.min,
      max: parsed.max,
      step: parsed.step,
    }
  }

  if (parsed.widgetType === 'date-range') {
    const nextValue = dateRangeValueSchema.parse(
      parsed.value ?? parsed.defaultValue ?? { start: '', end: '' }
    )
    return {
      widgetType: 'date-range',
      label: parsed.label?.trim() || 'Date Range',
      helpText: parsed.helpText?.trim() || undefined,
      autoRun: parsed.autoRun !== false,
      hidden: parsed.hidden === true || undefined,
      disabled: parsed.disabled === true || undefined,
      required: parsed.required === true || undefined,
      placeholder: parsed.placeholder?.trim() || undefined,
      value: nextValue,
      defaultValue: dateRangeValueSchema.parse(parsed.defaultValue ?? nextValue),
      min: parsed.min,
      max: parsed.max,
      step: parsed.step,
      config: {
        startKey: String(parsed.config?.startKey || '').trim(),
        endKey: String(parsed.config?.endKey || '').trim(),
      },
    }
  }

  if (parsed.widgetType === 'actions') {
    const targetCellIds = Array.isArray(parsed.config?.targetCellIds)
      ? parsed.config.targetCellIds.map((item) => String(item).trim()).filter(Boolean)
      : []
    return {
      widgetType: 'actions',
      label: parsed.label?.trim() || 'Run Queries',
      helpText: parsed.helpText?.trim() || undefined,
      hidden: parsed.hidden === true || undefined,
      disabled: parsed.disabled === true || undefined,
      required: parsed.required === true || undefined,
      placeholder: parsed.placeholder?.trim() || undefined,
      min: parsed.min,
      max: parsed.max,
      step: parsed.step,
      config: {
        action: parsed.config?.action as 'run-all' | 'run-targets',
        targetCellIds,
      },
    }
  }

  return {
    widgetType: 'callout',
    hidden: parsed.hidden === true || undefined,
    required: parsed.required === true || undefined,
    placeholder: parsed.placeholder?.trim() || undefined,
    min: parsed.min,
    max: parsed.max,
    step: parsed.step,
    config: {
      tone:
        parsed.config?.tone === 'success' ||
        parsed.config?.tone === 'warning' ||
        parsed.config?.tone === 'danger'
          ? parsed.config.tone
          : 'info',
      title: trimIfString(parsed.config?.title) || undefined,
      body: trimIfString(parsed.config?.body) || undefined,
    },
  }
}

export function getWidgetParamValues(metadata: NotebookWidgetMetadata): Record<string, unknown> {
  const normalized = normalizeWidgetMetadata(metadata)

  if (isInputLikeWidget(normalized)) {
    if (!normalized.key) return {}
    return { [normalized.key]: normalized.value }
  }

  if (normalized.widgetType === 'radio-group') {
    if (!normalized.key) return {}
    return { [normalized.key]: normalized.value ?? normalized.defaultValue ?? '' }
  }

  if (normalized.widgetType === 'date-range') {
    const startKey = normalized.config?.startKey
    const endKey = normalized.config?.endKey
    const value =
      normalized.value &&
      typeof normalized.value === 'object' &&
      'start' in normalized.value &&
      'end' in normalized.value
        ? normalized.value
        : normalized.defaultValue &&
            typeof normalized.defaultValue === 'object' &&
            'start' in normalized.defaultValue &&
            'end' in normalized.defaultValue
          ? normalized.defaultValue
          : { start: '', end: '' }

    if (!startKey || !endKey) return {}
    const safeStartKey = String(startKey)
    const safeEndKey = String(endKey)
    return {
      [safeStartKey]: value.start,
      [safeEndKey]: value.end,
    }
  }

  return {}
}

function formatDateOffset(offsetDays: number) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}
