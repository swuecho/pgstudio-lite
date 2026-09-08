import { InputCellEditor } from './InputCellEditor'
import { fromLegacyInputMetadata, toLegacyInputMetadata } from './widgetInputAdapters'
import { ActionsEditor } from './WidgetActionsEditor'
import { CalloutEditor } from './WidgetCalloutEditor'
import { DateRangeEditor } from './WidgetDateRangeEditor'
import { RadioGroupEditor } from './WidgetRadioGroupEditor'
import type {
  NotebookInputValues,
  NotebookResolvedOptionsState,
  NotebookWidgetMetadata,
  NotebookWidgetType,
} from './types'
import type { WidgetValidationMessages } from '@/lib/notebook-widget-validation'
import { createDefaultWidgetMetadata, isInputLikeWidgetType } from '@/lib/notebook-widgets'
import styles from './NotebookPage.module.css'

type WidgetCellEditorProps = {
  metadata: NotebookWidgetMetadata
  disabled?: boolean
  collapsed?: boolean
  valueOnly?: boolean
  /** Text for the inline label in value-only mode; defaults to the parameter key. `null` hides it. */
  inlineLabel?: string | null
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
  inlineLabel,
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
        {isInputLikeWidgetType(metadata.widgetType) ? (
          <div className={styles.widgetInlineRow}>
            {inlineLabel === null ? null : (
              <span className={styles.widgetInlineLabel}>
                {inlineLabel || metadata.key || metadata.label || 'param'}
              </span>
            )}
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
          <RadioGroupEditor
            metadata={metadata}
            disabled={disabled}
            onChange={onChange}
            compact
            validationMessages={validationMessages}
          />
        ) : null}
        {metadata.widgetType === 'date-range' ? (
          <DateRangeEditor
            metadata={metadata}
            disabled={disabled}
            onChange={onChange}
            compact
            validationMessages={validationMessages}
          />
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
        {metadata.widgetType === 'callout' ? (
          <CalloutEditor metadata={metadata} disabled={disabled} onChange={onChange} compact />
        ) : null}
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
              onChange(createDefaultWidgetMetadata(nextType) as NotebookWidgetMetadata)
            }}
          >
            {WIDGET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {(metadata.widgetType === 'radio-group' ||
          metadata.widgetType === 'date-range' ||
          metadata.widgetType === 'actions') && (
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

      {isInputLikeWidgetType(metadata.widgetType) ? (
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
        <RadioGroupEditor
          metadata={metadata}
          disabled={disabled}
          onChange={onChange}
          validationMessages={validationMessages}
        />
      ) : null}

      {metadata.widgetType === 'date-range' ? (
        <DateRangeEditor
          metadata={metadata}
          disabled={disabled}
          onChange={onChange}
          validationMessages={validationMessages}
        />
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
