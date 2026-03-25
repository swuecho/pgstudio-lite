import { useEffect, useMemo, useState } from 'react'
import type { WidgetValidationMessages } from '../../lib/notebook-widget-validation'
import type { NotebookInputCellMetadata, NotebookInputOption, NotebookInputType, NotebookOptionSource, NotebookResolvedOptionsState } from './types'

type InputCellEditorProps = {
  metadata: NotebookInputCellMetadata
  disabled?: boolean
  onChange: (metadata: NotebookInputCellMetadata) => void
  valueOnly?: boolean
  showValueLabel?: boolean
  validationMessages?: WidgetValidationMessages
  sqlOptionsState?: NotebookResolvedOptionsState
  onRefreshSqlOptions?: () => void
}

const INPUT_TYPE_OPTIONS: Array<{ value: NotebookInputType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'datetime-local', label: 'Date & Time' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'select', label: 'Select' },
  { value: 'multiselect', label: 'Multi-select' },
  { value: 'range', label: 'Range slider' },
]

const OPTION_SOURCE_OPTIONS: Array<{ value: NotebookOptionSource; label: string }> = [
  { value: 'manual', label: 'Manual' },
  { value: 'sql', label: 'SQL Query' },
]

const DEFAULT_OPTIONS_QUERY = "select '' as value, '' as label where false;"

export function InputCellEditor({
  metadata,
  disabled,
  onChange,
  valueOnly,
  showValueLabel = true,
  validationMessages,
  sqlOptionsState,
  onRefreshSqlOptions,
}: InputCellEditorProps) {
  const [optionsDraft, setOptionsDraft] = useState(() => optionsToText(metadata.options))
  const [optionsEditing, setOptionsEditing] = useState(false)
  const [queryDraft, setQueryDraft] = useState(() => metadata.optionsQuery || '')
  const [queryEditing, setQueryEditing] = useState(false)
  const serializedOptions = optionsToText(metadata.options)
  const serializedQuery = metadata.optionsQuery || ''
  const optionsSource = getOptionsSource(metadata)
  const isOptionWidget = metadata.inputType === 'select' || metadata.inputType === 'multiselect'
  const sqlOptionState = sqlOptionsState || DEFAULT_RESOLVED_OPTIONS_STATE

  useEffect(() => {
    if (optionsEditing) return
    setOptionsDraft(serializedOptions)
  }, [optionsEditing, serializedOptions])

  useEffect(() => {
    if (queryEditing) return
    setQueryDraft(serializedQuery)
  }, [queryEditing, serializedQuery])

  const effectiveOptions = useMemo(() => {
    if (!isOptionWidget) return []
    return optionsSource === 'sql' ? sqlOptionState.options : metadata.options || []
  }, [isOptionWidget, metadata.options, optionsSource, sqlOptionState.options])

  useEffect(() => {
    if (!isOptionWidget || optionsSource !== 'sql') return
    if (sqlOptionState.loading || sqlOptionState.error || !metadata.optionsQuery?.trim()) return
    const nextValue =
      metadata.inputType === 'multiselect'
        ? coerceMultiselectValue(metadata.value, effectiveOptions)
        : coerceSelectValue(metadata.value, effectiveOptions, metadata.required === true)

    if (isSameInputValue(nextValue, metadata.value)) return
    onChange({ ...metadata, value: nextValue })
  }, [effectiveOptions, isOptionWidget, metadata, onChange, optionsSource, sqlOptionState.error, sqlOptionState.loading])

  function patch(next: Partial<NotebookInputCellMetadata>) {
    onChange({ ...metadata, ...next })
  }

  function setOptionsFromText(value: string) {
    patch({ options: parseOptionsText(value) })
  }

  function setOptionSource(nextSource: NotebookOptionSource) {
    const next: Partial<NotebookInputCellMetadata> = { optionsSource: nextSource }
    if (nextSource === 'manual') {
      const options = ensureSelectOptions(metadata.options)
      next.options = options
      next.value =
        metadata.inputType === 'multiselect'
          ? coerceMultiselectValue(metadata.value, options)
          : coerceSelectValue(metadata.value, options, metadata.required === true)
      next.optionsQuery = undefined
    } else {
      next.optionsQuery = metadata.optionsQuery?.trim() || DEFAULT_OPTIONS_QUERY
    }
    patch(next)
  }

  const valueId = `input-value-${metadata.key}`

  if (valueOnly) {
    return (
      <div className="min-w-0">
        <div className="grid gap-1.5">
          {showValueLabel ? <label htmlFor={valueId}>{metadata.label || metadata.key}</label> : null}
          <InputValueControl id={valueId} metadata={metadata} options={effectiveOptions} disabled={disabled} onChange={onChange} />
          {isOptionWidget && optionsSource === 'sql' && sqlOptionState.error ? (
            <div className="history-meta">{sqlOptionState.error}</div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-2.5">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <label className="grid gap-1.5 text-xs text-[var(--muted)]">
          Key
          <input
            className="w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 text-xs text-[var(--text)]"
            value={metadata.key}
            disabled={disabled}
            onChange={(event) => patch({ key: event.target.value.replace(/\s+/g, '_') })}
            placeholder="start_date"
          />
        </label>
        {validationMessages?.key?.length ? <ValidationList messages={validationMessages.key} /> : null}
        <label className="grid gap-1.5 text-xs text-[var(--muted)]">
          Label
          <input
            className="w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 text-xs text-[var(--text)]"
            value={metadata.label}
            disabled={disabled}
            onChange={(event) => patch({ label: event.target.value })}
            placeholder="Start date"
          />
        </label>
        {validationMessages?.label?.length ? <ValidationList messages={validationMessages.label} /> : null}
        <label className="grid gap-1.5 text-xs text-[var(--muted)]">
          Type
          <select
            className="h-8 w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 text-xs text-[var(--text)]"
            value={metadata.inputType}
            disabled={disabled}
            onChange={(event) => {
              const inputType = event.target.value as NotebookInputType
              const next: Partial<NotebookInputCellMetadata> = { inputType }
              if (inputType === 'checkbox') next.value = Boolean(metadata.value)
              else if (inputType === 'number' || inputType === 'range') next.value = metadata.value === null ? null : Number(metadata.value)
              else if (inputType === 'multiselect') next.value = Array.isArray(metadata.value) ? metadata.value : []
              else if (inputType === 'select') {
                const options = ensureSelectOptions(metadata.options)
                next.options = options
                next.value = coerceSelectValue(metadata.value, options, metadata.required === true)
              } else next.value = metadata.value === null || metadata.value === undefined ? '' : String(metadata.value)
              patch(next)
            }}
          >
            {INPUT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {(metadata.inputType === 'number' || metadata.inputType === 'range') && (
          <>
            <label className="grid gap-1.5 text-xs text-[var(--muted)]">
              Min
              <input
                className="w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 text-xs text-[var(--text)]"
                type="number"
                value={metadata.min ?? ''}
                disabled={disabled}
                onChange={(event) => patch({ min: event.target.value ? Number(event.target.value) : undefined })}
              />
            </label>
            <label className="grid gap-1.5 text-xs text-[var(--muted)]">
              Max
              <input
                className="w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 text-xs text-[var(--text)]"
                type="number"
                value={metadata.max ?? ''}
                disabled={disabled}
                onChange={(event) => patch({ max: event.target.value ? Number(event.target.value) : undefined })}
              />
            </label>
            <label className="grid gap-1.5 text-xs text-[var(--muted)]">
              Step
              <input
                className="w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 text-xs text-[var(--text)]"
                type="number"
                value={metadata.step ?? ''}
                disabled={disabled}
                onChange={(event) => patch({ step: event.target.value ? Number(event.target.value) : undefined })}
              />
            </label>
          </>
        )}

        {(metadata.inputType === 'text' || metadata.inputType === 'date' || metadata.inputType === 'datetime-local') && (
          <label className="grid gap-1.5 text-xs text-[var(--muted)]">
            Placeholder
            <input
              className="w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 text-xs text-[var(--text)]"
              value={metadata.placeholder || ''}
              disabled={disabled}
              onChange={(event) => patch({ placeholder: event.target.value })}
            />
          </label>
        )}

        {isOptionWidget && (
          <label className="grid gap-1.5 text-xs text-[var(--muted)]">
            Option Source
            <select
              className="h-8 w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 text-xs text-[var(--text)]"
              value={optionsSource}
              disabled={disabled}
              onChange={(event) => setOptionSource(event.target.value as NotebookOptionSource)}
            >
              {OPTION_SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {isOptionWidget && optionsSource === 'manual' && (
        <>
          <label className="grid gap-1.5 text-xs text-[var(--muted)]">
            Options (`value|label` per line)
            <textarea
              className="min-h-[84px] w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 font-mono text-xs text-[var(--text)]"
              value={optionsDraft}
              disabled={disabled}
              onFocus={() => setOptionsEditing(true)}
              onBlur={() => setOptionsEditing(false)}
              onChange={(event) => {
                const nextDraft = event.target.value
                setOptionsDraft(nextDraft)
                setOptionsFromText(nextDraft)
              }}
            />
          </label>
          {validationMessages?.options?.length ? <ValidationList messages={validationMessages.options} /> : null}
        </>
      )}

      {isOptionWidget && optionsSource === 'sql' && (
        <div className="grid gap-1.5">
          <label className="grid gap-1.5 text-xs text-[var(--muted)]">
            Options SQL
            <textarea
              className="min-h-[96px] w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 font-mono text-xs text-[var(--text)]"
              value={queryDraft}
              disabled={disabled}
              placeholder={"select id as value, name as label from my_table order by 2;"}
              onFocus={() => setQueryEditing(true)}
              onBlur={() => setQueryEditing(false)}
              onChange={(event) => {
                const nextDraft = event.target.value
                setQueryDraft(nextDraft)
                patch({ optionsQuery: nextDraft })
              }}
            />
          </label>
          {validationMessages?.optionsQuery?.length ? <ValidationList messages={validationMessages.optionsQuery} /> : null}
          <div className="history-meta">Return `value` and `label` columns. If `label` is omitted, the second column or `value` is used.</div>
          {onRefreshSqlOptions ? (
            <button className="btn small" type="button" onClick={onRefreshSqlOptions} disabled={disabled || sqlOptionState.loading}>
              {sqlOptionState.loading ? 'Refreshing...' : 'Refresh Options'}
            </button>
          ) : null}
          {sqlOptionState.loading ? <div className="history-meta">Loading options...</div> : null}
          {sqlOptionState.lastLoadedAt ? (
            <div className="history-meta">Last loaded: {new Date(sqlOptionState.lastLoadedAt).toLocaleString()}</div>
          ) : null}
          {sqlOptionState.error ? <div className="empty-state">{sqlOptionState.error}</div> : null}
          {!sqlOptionState.loading && !sqlOptionState.error ? (
            effectiveOptions.length ? (
              <div className="grid gap-1">
                <div className="history-meta">
                  Showing {Math.min(effectiveOptions.length, 10)} of {effectiveOptions.length} option(s)
                </div>
                <div className="max-h-40 overflow-auto rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-2 text-xs text-[var(--text)]">
                  {effectiveOptions.slice(0, 10).map((option) => (
                    <div key={option.value} className="font-mono">
                      {option.value}
                      {' | '}
                      {option.label}
                    </div>
                  ))}
                  {effectiveOptions.length > 10 ? (
                    <div className="mt-1 text-[var(--muted)]">...and {effectiveOptions.length - 10} more</div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="history-meta">No options returned yet</div>
            )
          ) : null}
        </div>
      )}

      <div className="grid gap-1.5">
        <label className="text-xs text-[var(--muted)]" htmlFor={valueId}>Value</label>
        <InputValueControl id={valueId} metadata={metadata} options={effectiveOptions} disabled={disabled} onChange={onChange} />
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="inline-flex items-center gap-2 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={metadata.required === true}
            disabled={disabled}
            onChange={(event) => patch({ required: event.target.checked })}
          />
          Required
        </label>
        <label className="inline-flex items-center gap-2 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={metadata.autoRun !== false}
            disabled={disabled}
            onChange={(event) => patch({ autoRun: event.target.checked })}
          />
          Auto-run dependent SQL
        </label>
      </div>
      {validationMessages?.general?.length ? <ValidationList messages={validationMessages.general} /> : null}
    </div>
  )
}

function InputValueControl({
  id,
  metadata,
  options,
  disabled,
  onChange,
}: {
  id: string
  metadata: NotebookInputCellMetadata
  options: NotebookInputOption[]
  disabled?: boolean
  onChange: (metadata: NotebookInputCellMetadata) => void
}) {
  const patchValue = (value: NotebookInputCellMetadata['value']) => onChange({ ...metadata, value })

  if (metadata.inputType === 'checkbox') {
    return (
      <input
        id={id}
        className="h-4 w-4 rounded border border-[var(--border)] bg-[var(--control-bg)]"
        type="checkbox"
        checked={Boolean(metadata.value)}
        disabled={disabled}
        onChange={(event) => patchValue(event.target.checked)}
      />
    )
  }

  if (metadata.inputType === 'number') {
    return (
      <input
        id={id}
        className="w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 text-xs text-[var(--text)]"
        type="number"
        value={metadata.value === null ? '' : Number(metadata.value)}
        disabled={disabled}
        min={metadata.min}
        max={metadata.max}
        step={metadata.step}
        onChange={(event) => patchValue(event.target.value === '' ? null : Number(event.target.value))}
      />
    )
  }

  if (metadata.inputType === 'range') {
    const numeric = metadata.value === null ? Number(metadata.min ?? 0) : Number(metadata.value)
    return (
      <div className="flex items-center gap-2.5">
        <input
          id={id}
          className="w-full"
          type="range"
          value={Number.isNaN(numeric) ? 0 : numeric}
          disabled={disabled}
          min={metadata.min ?? 0}
          max={metadata.max ?? 100}
          step={metadata.step ?? 1}
          onChange={(event) => patchValue(Number(event.target.value))}
        />
        <span className="history-meta">{Number.isNaN(numeric) ? '0' : String(numeric)}</span>
      </div>
    )
  }

  if (metadata.inputType === 'select') {
    return (
      <select
        id={id}
        className="h-8 w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 text-xs text-[var(--text)]"
        value={String(metadata.value ?? '')}
        disabled={disabled}
        onChange={(event) => patchValue(event.target.value)}
      >
        {!metadata.required ? <option value="">(empty)</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }

  if (metadata.inputType === 'multiselect') {
    const values = Array.isArray(metadata.value) ? metadata.value : []
    return (
      <select
        id={id}
        className="min-h-[84px] w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 text-xs text-[var(--text)]"
        multiple
        value={values}
        disabled={disabled}
        onChange={(event) => {
          const selected = [...event.target.selectedOptions].map((item) => item.value)
          patchValue(selected)
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }

  return (
    <input
      id={id}
      className="w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 text-xs text-[var(--text)]"
      type={metadata.inputType}
      value={String(metadata.value ?? '')}
      disabled={disabled}
      placeholder={metadata.placeholder}
      onChange={(event) => patchValue(event.target.value)}
    />
  )
}

function getOptionsSource(metadata: NotebookInputCellMetadata): NotebookOptionSource {
  return metadata.optionsSource === 'sql' ? 'sql' : 'manual'
}

function optionsToText(options: NotebookInputOption[] | undefined) {
  return (options || []).map((item) => `${item.value}|${item.label}`).join('\n')
}

function parseOptionsText(value: string): NotebookInputOption[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [left, ...rest] = line.split('|')
      const optValue = left.trim()
      const label = rest.join('|').trim() || optValue
      return { value: optValue, label }
    })
}

function ensureSelectOptions(options: NotebookInputOption[] | undefined) {
  if (options && options.length > 0) return options
  return [{ value: 'option_1', label: 'Option 1' }]
}

function coerceSelectValue(value: NotebookInputCellMetadata['value'], options: NotebookInputOption[], required: boolean) {
  const current = value === null || value === undefined ? '' : String(value)
  if (!options.length) return required ? '' : current
  if (!current && required) return options[0].value
  if (!current && !required) return ''
  if (options.some((option) => option.value === current)) return current
  return required ? options[0].value : ''
}

function coerceMultiselectValue(value: NotebookInputCellMetadata['value'], options: NotebookInputOption[]) {
  const current = Array.isArray(value) ? value.map((item) => String(item)) : []
  const allowed = new Set(options.map((option) => option.value))
  return current.filter((item) => allowed.has(item))
}

function isSameInputValue(left: NotebookInputCellMetadata['value'], right: NotebookInputCellMetadata['value']) {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false
    return left.every((item, index) => item === right[index])
  }
  return left === right
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

const DEFAULT_RESOLVED_OPTIONS_STATE: NotebookResolvedOptionsState = {
  options: [],
  loading: false,
  error: '',
}
