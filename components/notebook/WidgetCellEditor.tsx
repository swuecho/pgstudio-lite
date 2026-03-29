import { InputCellEditor } from './InputCellEditor'
import type {
  NotebookInputCellMetadata,
  NotebookInputType,
  NotebookInputValues,
  NotebookResolvedOptionsState,
  NotebookWidgetMetadata,
  NotebookWidgetType,
} from './types'
import type { WidgetValidationMessages } from '../../lib/notebook-widget-validation'
import styles from './NotebookPage.module.css'

type WidgetCellEditorProps = {
  metadata: NotebookWidgetMetadata
  disabled?: boolean
  collapsed?: boolean
  valueOnly?: boolean
  notebookId?: string
  inputValues?: NotebookInputValues
  sqlOptionsState?: NotebookResolvedOptionsState
  onRefreshSqlOptions?: () => void
  validationMessages?: WidgetValidationMessages
  availableSqlTargets?: Array<{ id: string; label: string }>
  onChange: (metadata: NotebookWidgetMetadata) => void
  onTriggerAction?: (metadata: NotebookWidgetMetadata) => void
}

const WIDGET_OPTIONS: Array<{ value: NotebookWidgetType; label: string }> = [
  { value: 'text', label: 'Text Input' },
  { value: 'number', label: 'Number Input' },
  { value: 'date', label: 'Date Input' },
  { value: 'datetime-local', label: 'DateTime Input' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'select', label: 'Select' },
  { value: 'multiselect', label: 'Multi-select' },
  { value: 'range', label: 'Range Slider' },
  { value: 'radio-group', label: 'Radio Group' },
  { value: 'date-range', label: 'Date Range' },
  { value: 'actions', label: 'Actions' },
  { value: 'callout', label: 'Callout' },
]

export function WidgetCellEditor({
  metadata,
  disabled,
  collapsed,
  valueOnly,
  notebookId: _notebookId,
  inputValues: _inputValues,
  sqlOptionsState,
  onRefreshSqlOptions,
  validationMessages,
  availableSqlTargets = [],
  onChange,
  onTriggerAction,
}: WidgetCellEditorProps) {
  if (collapsed || valueOnly) {
    return (
      <div className={styles.widgetCollapsedSummary}>
        {isInputLikeWidget(metadata.widgetType) ? (
          <div className={styles.widgetInlineRow}>
            <span className={styles.widgetInlineLabel}>{metadata.key || metadata.label || 'param'}</span>
            <InputLikeWidgetEditor
              metadata={metadata}
              disabled={disabled}
              onChange={onChange}
              valueOnly
              sqlOptionsState={sqlOptionsState}
              onRefreshSqlOptions={onRefreshSqlOptions}
              validationMessages={validationMessages}
            />
          </div>
        ) : null}
        {metadata.widgetType === 'radio-group' ? (
          <RadioGroupEditor metadata={metadata} disabled={disabled} onChange={onChange} compact validationMessages={validationMessages} />
        ) : null}
        {metadata.widgetType === 'date-range' ? (
          <DateRangeEditor metadata={metadata} disabled={disabled} onChange={onChange} compact validationMessages={validationMessages} />
        ) : null}
        {metadata.widgetType === 'actions' ? (
          <ActionsEditor
            metadata={metadata}
            disabled={disabled}
            availableSqlTargets={availableSqlTargets}
            onChange={onChange}
            onTriggerAction={onTriggerAction}
            compact
          />
        ) : null}
        {metadata.widgetType === 'callout' ? <CalloutEditor metadata={metadata} disabled={disabled} onChange={onChange} compact /> : null}
      </div>
    )
  }

  const patch = (next: Partial<NotebookWidgetMetadata>) => onChange({ ...metadata, ...next })

  return (
    <div className={styles.widgetEditor}>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <label className="grid gap-1.5 text-xs text-[var(--muted)]">
          Widget Type
          <select
            className="h-8 w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 text-xs text-[var(--text)]"
            value={metadata.widgetType}
            disabled={disabled}
            onChange={(event) => {
              const nextType = event.target.value as NotebookWidgetType
              onChange(defaultMetadataForType(nextType))
            }}
          >
            {WIDGET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {(metadata.widgetType === 'radio-group' || metadata.widgetType === 'date-range' || metadata.widgetType === 'actions') && (
          <label className="grid gap-1.5 text-xs text-[var(--muted)]">
            Label
            <input
              className="w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 text-xs text-[var(--text)]"
              value={metadata.label || ''}
              disabled={disabled}
              onChange={(event) => patch({ label: event.target.value })}
            />
          </label>
        )}

        {(metadata.widgetType === 'radio-group' || metadata.widgetType === 'date-range') && (
          <label className="inline-flex items-center gap-2 self-end text-xs text-[var(--muted)]">
            <input
              type="checkbox"
              checked={metadata.autoRun !== false}
              disabled={disabled}
              onChange={(event) => patch({ autoRun: event.target.checked })}
            />
            Auto-run dependent SQL
          </label>
        )}
      </div>

      {isInputLikeWidget(metadata.widgetType) ? (
        <InputLikeWidgetEditor
          metadata={metadata}
          disabled={disabled}
          onChange={onChange}
          sqlOptionsState={sqlOptionsState}
          onRefreshSqlOptions={onRefreshSqlOptions}
          validationMessages={validationMessages}
        />
      ) : null}

      {metadata.widgetType === 'radio-group' ? (
        <RadioGroupEditor metadata={metadata} disabled={disabled} onChange={onChange} validationMessages={validationMessages} />
      ) : null}

      {metadata.widgetType === 'date-range' ? (
        <DateRangeEditor metadata={metadata} disabled={disabled} onChange={onChange} validationMessages={validationMessages} />
      ) : null}

      {metadata.widgetType === 'actions' ? (
        <ActionsEditor
          metadata={metadata}
          disabled={disabled}
          availableSqlTargets={availableSqlTargets}
          onChange={onChange}
          onTriggerAction={onTriggerAction}
        />
      ) : null}

      {metadata.widgetType === 'callout' ? (
        <CalloutEditor metadata={metadata} disabled={disabled} onChange={onChange} />
      ) : null}
    </div>
  )
}

function InputLikeWidgetEditor({
  metadata,
  disabled,
  onChange,
  valueOnly,
  sqlOptionsState,
  onRefreshSqlOptions,
  validationMessages,
}: {
  metadata: NotebookWidgetMetadata
  disabled?: boolean
  onChange: (metadata: NotebookWidgetMetadata) => void
  valueOnly?: boolean
  sqlOptionsState?: NotebookResolvedOptionsState
  onRefreshSqlOptions?: () => void
  validationMessages?: WidgetValidationMessages
}) {
  const inputMetadata = toLegacyInputMetadata(metadata)
  return (
    <InputCellEditor
      metadata={inputMetadata}
      disabled={disabled}
      valueOnly={valueOnly}
      showValueLabel={!valueOnly}
      validationMessages={validationMessages}
      sqlOptionsState={sqlOptionsState}
      onRefreshSqlOptions={onRefreshSqlOptions}
      onChange={(next) => onChange(fromLegacyInputMetadata(metadata, next))}
    />
  )
}

function RadioGroupEditor({
  metadata,
  disabled,
  onChange,
  compact,
  validationMessages,
}: {
  metadata: NotebookWidgetMetadata
  disabled?: boolean
  onChange: (metadata: NotebookWidgetMetadata) => void
  compact?: boolean
  validationMessages?: WidgetValidationMessages
}) {
  const value = typeof metadata.value === 'string' ? metadata.value : ''
  const options = metadata.options || []
  if (compact) {
    return (
      <div className={styles.widgetInlineRow}>
        <span className={styles.widgetInlineLabel}>{metadata.key || metadata.label || 'Choice'}</span>
        <div className={styles.widgetOptionRow}>
          {options.map((option) => (
            <label key={option.value} className={styles.widgetOptionChip}>
              <input
                type="radio"
                name={`widget-radio-${metadata.key || 'widget'}-compact`}
                checked={value === option.value}
                disabled={disabled}
                onChange={() => onChange({ ...metadata, value: option.value })}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </div>
    )
  }
  return (
    <>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <label className="grid gap-1.5 text-xs text-[var(--muted)]">
          Key
          <input
            className="w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 text-xs text-[var(--text)]"
            value={metadata.key || ''}
            disabled={disabled}
            onChange={(event) => onChange({ ...metadata, key: event.target.value.replace(/\s+/g, '_') })}
          />
        </label>
        {validationMessages?.key?.length ? <ValidationList messages={validationMessages.key} /> : null}
        <label className="grid gap-1.5 text-xs text-[var(--muted)]">
          Options (`value|label` per line)
          <textarea
            className="min-h-[84px] w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 font-mono text-xs text-[var(--text)]"
            value={options.map((item) => `${item.value}|${item.label}`).join('\n')}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...metadata,
                options: event.target.value
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line) => {
                    const [left, ...rest] = line.split('|')
                    return {
                      value: left.trim(),
                      label: rest.join('|').trim() || left.trim(),
                    }
                  }),
              })
            }
          />
        </label>
        {validationMessages?.options?.length ? <ValidationList messages={validationMessages.options} /> : null}
      </div>
      {validationMessages?.label?.length ? <ValidationList messages={validationMessages.label} /> : null}
      {validationMessages?.general?.length ? <ValidationList messages={validationMessages.general} /> : null}
      <div className={styles.widgetOptionRow}>
        {options.map((option) => (
          <label key={option.value} className={styles.widgetOptionChip}>
            <input
              type="radio"
              name={`widget-radio-${metadata.key || 'widget'}`}
              checked={value === option.value}
              disabled={disabled}
              onChange={() => onChange({ ...metadata, value: option.value })}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </>
  )
}

function DateRangeEditor({
  metadata,
  disabled,
  onChange,
  compact,
  validationMessages,
}: {
  metadata: NotebookWidgetMetadata
  disabled?: boolean
  onChange: (metadata: NotebookWidgetMetadata) => void
  compact?: boolean
  validationMessages?: WidgetValidationMessages
}) {
  const value =
    metadata.value && typeof metadata.value === 'object' && 'start' in metadata.value && 'end' in metadata.value
      ? metadata.value
      : { start: '', end: '' }
  if (compact) {
    return (
      <div className={styles.widgetInlineRow}>
        <span className={styles.widgetInlineLabel}>
          {metadata.config?.startKey || metadata.config?.endKey || metadata.label || 'Date Range'}
        </span>
        <div className={styles.widgetDateCompact}>
          <input
            className={styles.widgetCompactInput}
            type="date"
            value={value.start}
            disabled={disabled}
            onChange={(event) => onChange({ ...metadata, value: { ...value, start: event.target.value } })}
          />
          <span className={styles.widgetDateSeparator}>to</span>
          <input
            className={styles.widgetCompactInput}
            type="date"
            value={value.end}
            disabled={disabled}
            onChange={(event) => onChange({ ...metadata, value: { ...value, end: event.target.value } })}
          />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <label className="grid gap-1.5 text-xs text-[var(--muted)]">
          Start Key
          <input
            className="w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 text-xs text-[var(--text)]"
            value={metadata.config?.startKey || ''}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...metadata,
                config: { ...metadata.config, startKey: event.target.value.replace(/\s+/g, '_') },
              })
            }
          />
        </label>
        {validationMessages?.startKey?.length ? <ValidationList messages={validationMessages.startKey} /> : null}
        <label className="grid gap-1.5 text-xs text-[var(--muted)]">
          End Key
          <input
            className="w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 text-xs text-[var(--text)]"
            value={metadata.config?.endKey || ''}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...metadata,
                config: { ...metadata.config, endKey: event.target.value.replace(/\s+/g, '_') },
              })
            }
          />
        </label>
        {validationMessages?.endKey?.length ? <ValidationList messages={validationMessages.endKey} /> : null}
      </div>
      {validationMessages?.label?.length ? <ValidationList messages={validationMessages.label} /> : null}
      {validationMessages?.general?.length ? <ValidationList messages={validationMessages.general} /> : null}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <label className="grid gap-1.5 text-xs text-[var(--muted)]">
          Start Date
          <input
            className="w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 text-xs text-[var(--text)]"
            type="date"
            value={value.start}
            disabled={disabled}
            onChange={(event) => onChange({ ...metadata, value: { ...value, start: event.target.value } })}
          />
        </label>
        <label className="grid gap-1.5 text-xs text-[var(--muted)]">
          End Date
          <input
            className="w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 text-xs text-[var(--text)]"
            type="date"
            value={value.end}
            disabled={disabled}
            onChange={(event) => onChange({ ...metadata, value: { ...value, end: event.target.value } })}
          />
        </label>
      </div>
    </>
  )
}

function ActionsEditor({
  metadata,
  disabled,
  availableSqlTargets,
  onChange,
  onTriggerAction,
  compact,
}: {
  metadata: NotebookWidgetMetadata
  disabled?: boolean
  availableSqlTargets: Array<{ id: string; label: string }>
  onChange: (metadata: NotebookWidgetMetadata) => void
  onTriggerAction?: (metadata: NotebookWidgetMetadata) => void
  compact?: boolean
}) {
  const action = metadata.config?.action || 'run-all'
  const selectedTargetIds = metadata.config?.targetCellIds || []
  if (compact) {
    return (
      <div className={styles.widgetInlineRow}>
        <span className={styles.widgetInlineLabel}>{metadata.label || 'Action'}</span>
        <button className={`btn small primary ${styles.widgetActionButton}`} disabled={disabled} type="button" onClick={() => onTriggerAction?.(metadata)}>
          {metadata.label || (action === 'run-targets' ? 'Run Targets' : 'Run')}
        </button>
      </div>
    )
  }
  return (
    <>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <label className="grid gap-1.5 text-xs text-[var(--muted)]">
          Action
          <select
            className="h-8 w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 text-xs text-[var(--text)]"
            value={action}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...metadata,
                config: { ...metadata.config, action: event.target.value as 'run-all' | 'run-targets' },
              })
            }
          >
            <option value="run-all">Run All SQL Cells</option>
            <option value="run-targets">Run Target Cell IDs</option>
          </select>
        </label>

        {action === 'run-targets' ? (
          <div className={styles.widgetTargetPicker}>
            <div className={styles.widgetTargetPickerTitle}>Target SQL Cells</div>
            {availableSqlTargets.length ? (
              <div className={styles.widgetTargetList}>
                {availableSqlTargets.map((target) => {
                  const checked = selectedTargetIds.includes(target.id)
                  return (
                    <label key={target.id} className={styles.widgetTargetItem}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={(event) =>
                          onChange({
                            ...metadata,
                            config: {
                              ...metadata.config,
                              targetCellIds: event.target.checked
                                ? [...selectedTargetIds, target.id]
                                : selectedTargetIds.filter((item) => item !== target.id),
                            },
                          })
                        }
                      />
                      <span>{target.label}</span>
                    </label>
                  )
                })}
              </div>
            ) : (
              <div className={styles.widgetEmptyHint}>Add SQL cells to target them from this action.</div>
            )}
          </div>
        ) : null}
      </div>
      {action === 'run-targets' && selectedTargetIds.length ? (
        <div className={styles.widgetTargetSummary}>
          {selectedTargetIds.map((item) => (
            <span key={item} className={styles.widgetTag}>
              {availableSqlTargets.find((target) => target.id === item)?.label || item}
            </span>
          ))}
        </div>
      ) : null}
      <button className={`btn small primary ${styles.widgetActionButton}`} disabled={disabled} type="button" onClick={() => onTriggerAction?.(metadata)}>
        {metadata.label || 'Run'}
      </button>
    </>
  )
}

function CalloutEditor({
  metadata,
  disabled,
  onChange,
  compact,
}: {
  metadata: NotebookWidgetMetadata
  disabled?: boolean
  onChange: (metadata: NotebookWidgetMetadata) => void
  compact?: boolean
}) {
  const tone = metadata.config?.tone || 'info'
  if (compact) {
    return (
      <div className={`${styles.widgetCalloutPreview} ${calloutToneClassName(tone)}`}>
        {metadata.config?.title ? <div className="font-medium">{metadata.config.title}</div> : null}
        {metadata.config?.body ? <div className="mt-1 whitespace-pre-wrap">{metadata.config.body}</div> : null}
      </div>
    )
  }
  return (
    <>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <label className="grid gap-1.5 text-xs text-[var(--muted)]">
          Tone
          <select
            className="h-8 w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 text-xs text-[var(--text)]"
            value={tone}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...metadata,
                config: { ...metadata.config, tone: event.target.value as 'info' | 'success' | 'warning' | 'danger' },
              })
            }
          >
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="danger">Danger</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-xs text-[var(--muted)]">
          Title
          <input
            className="w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 text-xs text-[var(--text)]"
            value={metadata.config?.title || ''}
            disabled={disabled}
            onChange={(event) => onChange({ ...metadata, config: { ...metadata.config, title: event.target.value } })}
          />
        </label>
      </div>
      <label className="grid gap-1.5 text-xs text-[var(--muted)]">
        Body
        <textarea
          className="min-h-[84px] w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 text-xs text-[var(--text)]"
          value={metadata.config?.body || ''}
          disabled={disabled}
          onChange={(event) => onChange({ ...metadata, config: { ...metadata.config, body: event.target.value } })}
        />
      </label>
      <div className={`${styles.widgetCalloutPreview} ${calloutToneClassName(tone)}`}>
        {metadata.config?.title ? <div className="font-medium">{metadata.config.title}</div> : null}
        {metadata.config?.body ? <div className="mt-1 whitespace-pre-wrap">{metadata.config.body}</div> : null}
      </div>
    </>
  )
}

function calloutToneClassName(tone: 'info' | 'success' | 'warning' | 'danger') {
  if (tone === 'success') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
  if (tone === 'warning') return 'border-amber-500/40 bg-amber-500/10 text-amber-200'
  if (tone === 'danger') return 'border-rose-500/40 bg-rose-500/10 text-rose-200'
  return 'border-sky-500/40 bg-sky-500/10 text-sky-200'
}

function defaultMetadataForType(widgetType: NotebookWidgetType): NotebookWidgetMetadata {
  if (isInputLikeWidget(widgetType)) {
    return {
      widgetType,
      key: `param_${Math.random().toString(36).slice(2, 8)}`,
      label: 'Input',
      autoRun: true,
      value:
        widgetType === 'checkbox' ? false : widgetType === 'number' || widgetType === 'range' ? null : widgetType === 'multiselect' ? [] : '',
      options: widgetType === 'select' || widgetType === 'multiselect' ? [{ label: 'Option 1', value: 'option_1' }] : undefined,
      config: widgetType === 'select' || widgetType === 'multiselect' ? { optionSource: 'manual' } : undefined,
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

function isInputLikeWidget(
  widgetType: NotebookWidgetType
): widgetType is 'text' | 'number' | 'date' | 'datetime-local' | 'checkbox' | 'select' | 'range' | 'multiselect' {
  return (
    widgetType === 'text' ||
    widgetType === 'number' ||
    widgetType === 'date' ||
    widgetType === 'datetime-local' ||
    widgetType === 'checkbox' ||
    widgetType === 'select' ||
    widgetType === 'range' ||
    widgetType === 'multiselect'
  )
}

function toLegacyInputMetadata(metadata: NotebookWidgetMetadata): NotebookInputCellMetadata {
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
    optionsQuery: typeof metadata.config?.optionsQuery === 'string' ? metadata.config.optionsQuery : undefined,
    min: metadata.min,
    max: metadata.max,
    step: metadata.step,
    autoRun: metadata.autoRun,
  }
}

function fromLegacyInputMetadata(current: NotebookWidgetMetadata, metadata: NotebookInputCellMetadata): NotebookWidgetMetadata {
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

function ValidationList({ messages }: { messages: string[] }) {
  return (
    <div className="grid gap-1">
      {messages.map((message, index) => (
        <div key={`${message}-${index}`} className="text-xs text-rose-300">
          {message}
        </div>
      ))}
    </div>
  )
}
