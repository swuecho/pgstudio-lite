import type { NotebookWidgetMetadata } from './types'
import styles from './NotebookPage.module.css'

export function CalloutEditor({
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
        {metadata.config?.body ? (
          <div className="mt-1 whitespace-pre-wrap">{metadata.config.body}</div>
        ) : null}
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
                config: {
                  ...metadata.config,
                  tone: event.target.value as 'info' | 'success' | 'warning' | 'danger',
                },
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
            onChange={(event) =>
              onChange({ ...metadata, config: { ...metadata.config, title: event.target.value } })
            }
          />
        </label>
      </div>
      <label className="grid gap-1.5 text-xs text-[var(--muted)]">
        Body
        <textarea
          className="min-h-[84px] w-full rounded-[7px] border border-[var(--border)] bg-[var(--control-bg)] px-2.5 py-1.5 text-xs text-[var(--text)]"
          value={metadata.config?.body || ''}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...metadata, config: { ...metadata.config, body: event.target.value } })
          }
        />
      </label>
      <div className={`${styles.widgetCalloutPreview} ${calloutToneClassName(tone)}`}>
        {metadata.config?.title ? <div className="font-medium">{metadata.config.title}</div> : null}
        {metadata.config?.body ? (
          <div className="mt-1 whitespace-pre-wrap">{metadata.config.body}</div>
        ) : null}
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
