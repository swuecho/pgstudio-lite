import type { NotebookInputCellMetadata, NotebookInputOption, NotebookInputType } from './types'

type InputCellEditorProps = {
  metadata: NotebookInputCellMetadata
  disabled?: boolean
  onChange: (metadata: NotebookInputCellMetadata) => void
  valueOnly?: boolean
  showValueLabel?: boolean
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

export function InputCellEditor({ metadata, disabled, onChange, valueOnly, showValueLabel = true }: InputCellEditorProps) {
  function patch(next: Partial<NotebookInputCellMetadata>) {
    onChange({ ...metadata, ...next })
  }

  function setOptionsFromText(value: string) {
    const options: NotebookInputOption[] = value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [left, ...rest] = line.split('|')
        const optValue = left.trim()
        const label = rest.join('|').trim() || optValue
        return { value: optValue, label }
      })
    patch({ options })
  }

  function optionsToText(options: NotebookInputOption[] | undefined) {
    return (options || []).map((item) => `${item.value}|${item.label}`).join('\n')
  }

  const valueId = `input-value-${metadata.key}`

  if (valueOnly) {
    return (
      <div className="input-cell-value-only">
        <div className="input-cell-value-row">
          {showValueLabel ? <label htmlFor={valueId}>{metadata.label || metadata.key}</label> : null}
          <InputValueControl id={valueId} metadata={metadata} disabled={disabled} onChange={onChange} />
        </div>
      </div>
    )
  }

  return (
    <div className="input-cell-grid">
      <div className="input-cell-config-grid">
        <label>
          Key
          <input
            value={metadata.key}
            disabled={disabled}
            onChange={(event) => patch({ key: event.target.value.replace(/\s+/g, '_') })}
            placeholder="start_date"
          />
        </label>
        <label>
          Label
          <input
            value={metadata.label}
            disabled={disabled}
            onChange={(event) => patch({ label: event.target.value })}
            placeholder="Start date"
          />
        </label>
        <label>
          Type
          <select
            value={metadata.inputType}
            disabled={disabled}
            onChange={(event) => {
              const inputType = event.target.value as NotebookInputType
              const next: Partial<NotebookInputCellMetadata> = { inputType }
              if (inputType === 'checkbox') next.value = Boolean(metadata.value)
              else if (inputType === 'number' || inputType === 'range') next.value = metadata.value === null ? null : Number(metadata.value)
              else if (inputType === 'multiselect') next.value = Array.isArray(metadata.value) ? metadata.value : []
              else next.value = metadata.value === null || metadata.value === undefined ? '' : String(metadata.value)
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

      <div className="input-cell-config-grid">
        {(metadata.inputType === 'number' || metadata.inputType === 'range') && (
          <>
            <label>
              Min
              <input
                type="number"
                value={metadata.min ?? ''}
                disabled={disabled}
                onChange={(event) => patch({ min: event.target.value ? Number(event.target.value) : undefined })}
              />
            </label>
            <label>
              Max
              <input
                type="number"
                value={metadata.max ?? ''}
                disabled={disabled}
                onChange={(event) => patch({ max: event.target.value ? Number(event.target.value) : undefined })}
              />
            </label>
            <label>
              Step
              <input
                type="number"
                value={metadata.step ?? ''}
                disabled={disabled}
                onChange={(event) => patch({ step: event.target.value ? Number(event.target.value) : undefined })}
              />
            </label>
          </>
        )}

        {(metadata.inputType === 'text' || metadata.inputType === 'date' || metadata.inputType === 'datetime-local') && (
          <label>
            Placeholder
            <input
              value={metadata.placeholder || ''}
              disabled={disabled}
              onChange={(event) => patch({ placeholder: event.target.value })}
            />
          </label>
        )}
      </div>

      {(metadata.inputType === 'select' || metadata.inputType === 'multiselect') && (
        <label>
          Options (`value|label` per line)
          <textarea
            className="input-cell-options"
            value={optionsToText(metadata.options)}
            disabled={disabled}
            onChange={(event) => setOptionsFromText(event.target.value)}
          />
        </label>
      )}

      <div className="input-cell-value-row">
        <label htmlFor={valueId}>Value</label>
        <InputValueControl id={valueId} metadata={metadata} disabled={disabled} onChange={onChange} />
      </div>

      <div className="input-cell-toggle-row">
        <label>
          <input
            type="checkbox"
            checked={metadata.required === true}
            disabled={disabled}
            onChange={(event) => patch({ required: event.target.checked })}
          />
          Required
        </label>
        <label>
          <input
            type="checkbox"
            checked={metadata.autoRun !== false}
            disabled={disabled}
            onChange={(event) => patch({ autoRun: event.target.checked })}
          />
          Auto-run dependent SQL
        </label>
      </div>
    </div>
  )
}

function InputValueControl({
  id,
  metadata,
  disabled,
  onChange,
}: {
  id: string
  metadata: NotebookInputCellMetadata
  disabled?: boolean
  onChange: (metadata: NotebookInputCellMetadata) => void
}) {
  const patchValue = (value: NotebookInputCellMetadata['value']) => onChange({ ...metadata, value })

  if (metadata.inputType === 'checkbox') {
    return <input id={id} type="checkbox" checked={Boolean(metadata.value)} disabled={disabled} onChange={(event) => patchValue(event.target.checked)} />
  }

  if (metadata.inputType === 'number') {
    return (
      <input
        id={id}
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
      <div className="input-cell-range-wrap">
        <input
          id={id}
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
      <select id={id} value={String(metadata.value ?? '')} disabled={disabled} onChange={(event) => patchValue(event.target.value)}>
        {!metadata.required ? <option value="">(empty)</option> : null}
        {(metadata.options || []).map((option) => (
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
        multiple
        value={values}
        disabled={disabled}
        onChange={(event) => {
          const selected = [...event.target.selectedOptions].map((item) => item.value)
          patchValue(selected)
        }}
      >
        {(metadata.options || []).map((option) => (
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
      type={metadata.inputType}
      value={String(metadata.value ?? '')}
      disabled={disabled}
      placeholder={metadata.placeholder}
      onChange={(event) => patchValue(event.target.value)}
    />
  )
}
