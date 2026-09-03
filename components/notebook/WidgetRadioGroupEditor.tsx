import type { NotebookWidgetMetadata } from './types'
import type { WidgetValidationMessages } from '@/lib/notebook-widget-validation'
import { WidgetValidationList as ValidationList } from './WidgetValidationList'
import styles from './NotebookPage.module.css'

export function RadioGroupEditor({
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
        {validationMessages?.options?.length ? (
          <ValidationList messages={validationMessages.options} />
        ) : null}
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
