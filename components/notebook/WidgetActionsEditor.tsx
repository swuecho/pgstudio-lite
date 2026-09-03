import type { NotebookWidgetMetadata } from './types'
import styles from './NotebookPage.module.css'

export function ActionsEditor({
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
        <button
          className={`btn small primary ${styles.widgetActionButton}`}
          disabled={disabled}
          type="button"
          onClick={() => onTriggerAction?.(metadata)}
        >
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
      <button
        className={`btn small primary ${styles.widgetActionButton}`}
        disabled={disabled}
        type="button"
        onClick={() => onTriggerAction?.(metadata)}
      >
        {metadata.label || 'Run'}
      </button>
    </>
  )
}
