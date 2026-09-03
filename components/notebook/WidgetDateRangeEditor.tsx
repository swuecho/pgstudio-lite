import type { NotebookWidgetMetadata } from './types'
import type { WidgetValidationMessages } from '@/lib/notebook-widget-validation'
import { WidgetValidationList as ValidationList } from './WidgetValidationList'
import styles from './NotebookPage.module.css'

export function DateRangeEditor({
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
    metadata.value &&
    typeof metadata.value === 'object' &&
    'start' in metadata.value &&
    'end' in metadata.value
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
        {validationMessages?.startKey?.length ? (
          <ValidationList messages={validationMessages.startKey} />
        ) : null}
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
