import { z } from 'zod'

export const notebookParamKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/

export const notebookWidgetTypeSchema = z.enum(['radio-group', 'date-range', 'actions', 'callout'])

export const notebookWidgetOptionSchema = z.object({
  label: z.string().trim().min(1),
  value: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
})

const widgetBaseSchema = z.object({
  key: z.string().trim().regex(notebookParamKeyPattern).optional(),
  label: z.string().trim().min(1).optional(),
  helpText: z.string().trim().min(1).optional(),
  autoRun: z.boolean().optional(),
  hidden: z.boolean().optional(),
  disabled: z.boolean().optional(),
  value: z.unknown().optional(),
  defaultValue: z.unknown().optional(),
  options: z.array(notebookWidgetOptionSchema).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})

const dateRangeValueSchema = z.object({
  start: z.string(),
  end: z.string(),
})

const radioGroupWidgetSchema = widgetBaseSchema.extend({
  widgetType: z.literal('radio-group'),
}).superRefine((value, ctx) => {
  if (!value.key) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['key'], message: 'key is required' })
  }
  if (!value.label) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['label'], message: 'label is required' })
  }
  if (!value.options?.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'at least one option is required' })
  }
  const parsedValue = value.value === undefined ? { success: true } : z.string().safeParse(value.value)
  if (!parsedValue.success) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'value must be a string' })
  }
  const parsedDefault = value.defaultValue === undefined ? { success: true } : z.string().safeParse(value.defaultValue)
  if (!parsedDefault.success) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'defaultValue must be a string' })
  }
})

const dateRangeWidgetSchema = widgetBaseSchema.extend({
  widgetType: z.literal('date-range'),
}).superRefine((value, ctx) => {
  const startKey = typeof value.config?.startKey === 'string' ? value.config.startKey.trim() : ''
  const endKey = typeof value.config?.endKey === 'string' ? value.config.endKey.trim() : ''
  if (!startKey) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['config', 'startKey'], message: 'startKey is required' })
  } else if (!notebookParamKeyPattern.test(startKey)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['config', 'startKey'], message: 'invalid startKey' })
  }
  if (!endKey) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['config', 'endKey'], message: 'endKey is required' })
  } else if (!notebookParamKeyPattern.test(endKey)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['config', 'endKey'], message: 'invalid endKey' })
  }
  if (startKey && endKey && startKey === endKey) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['config', 'endKey'], message: 'endKey must differ from startKey' })
  }
  const parsedValue = value.value === undefined ? { success: true } : dateRangeValueSchema.safeParse(value.value)
  if (!parsedValue.success) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'value must be an object with start and end' })
  }
  const parsedDefault = value.defaultValue === undefined ? { success: true } : dateRangeValueSchema.safeParse(value.defaultValue)
  if (!parsedDefault.success) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'defaultValue must be an object with start and end' })
  }
})

const actionsWidgetSchema = widgetBaseSchema.extend({
  widgetType: z.literal('actions'),
}).superRefine((value, ctx) => {
  if (value.key) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['key'], message: 'actions widgets cannot define a key' })
  }
  const action = value.config?.action
  if (action !== 'run-all' && action !== 'run-targets') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['config', 'action'], message: 'action must be run-all or run-targets' })
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

const calloutWidgetSchema = widgetBaseSchema.extend({
  widgetType: z.literal('callout'),
}).superRefine((value, ctx) => {
  if (value.key) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['key'], message: 'callout widgets cannot define a key' })
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
  radioGroupWidgetSchema,
  dateRangeWidgetSchema,
  actionsWidgetSchema,
  calloutWidgetSchema,
])

export type NotebookWidgetType = z.infer<typeof notebookWidgetTypeSchema>
export type NotebookWidgetOption = z.infer<typeof notebookWidgetOptionSchema>
export type NotebookWidgetMetadata = z.infer<typeof notebookWidgetMetadataSchema>

export function isWidgetMetadata(value: unknown): value is NotebookWidgetMetadata {
  return notebookWidgetMetadataSchema.safeParse(value).success
}

function trimIfString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value
}

export function createDefaultWidgetMetadata(widgetType: NotebookWidgetType): NotebookWidgetMetadata {
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

export function normalizeWidgetMetadata(input: NotebookWidgetMetadata): NotebookWidgetMetadata {
  const parsed = notebookWidgetMetadataSchema.parse(input)

  if (parsed.widgetType === 'radio-group') {
    const options = (parsed.options || []).map((option) => ({
      label: option.label.trim(),
      value: option.value.trim(),
      description: option.description?.trim() || undefined,
    }))
    const nextValue = typeof parsed.value === 'string' ? parsed.value : typeof parsed.defaultValue === 'string' ? parsed.defaultValue : options[0]?.value || ''
    return {
      widgetType: 'radio-group',
      key: parsed.key?.trim(),
      label: parsed.label?.trim(),
      helpText: parsed.helpText?.trim() || undefined,
      autoRun: parsed.autoRun !== false,
      hidden: parsed.hidden === true || undefined,
      disabled: parsed.disabled === true || undefined,
      value: nextValue,
      defaultValue: typeof parsed.defaultValue === 'string' ? parsed.defaultValue : nextValue,
      options,
    }
  }

  if (parsed.widgetType === 'date-range') {
    const nextValue = dateRangeValueSchema.parse(parsed.value ?? parsed.defaultValue ?? { start: '', end: '' })
    return {
      widgetType: 'date-range',
      label: parsed.label?.trim() || 'Date Range',
      helpText: parsed.helpText?.trim() || undefined,
      autoRun: parsed.autoRun !== false,
      hidden: parsed.hidden === true || undefined,
      disabled: parsed.disabled === true || undefined,
      value: nextValue,
      defaultValue: dateRangeValueSchema.parse(parsed.defaultValue ?? nextValue),
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
      config: {
        action: parsed.config?.action as 'run-all' | 'run-targets',
        targetCellIds,
      },
    }
  }

  return {
    widgetType: 'callout',
    hidden: parsed.hidden === true || undefined,
    config: {
      tone:
        parsed.config?.tone === 'success' || parsed.config?.tone === 'warning' || parsed.config?.tone === 'danger'
          ? parsed.config.tone
          : 'info',
      title: trimIfString(parsed.config?.title) || undefined,
      body: trimIfString(parsed.config?.body) || undefined,
    },
  }
}

export function getWidgetParamValues(metadata: NotebookWidgetMetadata): Record<string, unknown> {
  const normalized = normalizeWidgetMetadata(metadata)

  if (normalized.widgetType === 'radio-group') {
    if (!normalized.key) return {}
    return { [normalized.key]: normalized.value ?? normalized.defaultValue ?? '' }
  }

  if (normalized.widgetType === 'date-range') {
    const startKey = normalized.config?.startKey
    const endKey = normalized.config?.endKey
    const value =
      normalized.value && typeof normalized.value === 'object' && 'start' in normalized.value && 'end' in normalized.value
        ? normalized.value
        : normalized.defaultValue && typeof normalized.defaultValue === 'object' && 'start' in normalized.defaultValue && 'end' in normalized.defaultValue
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
