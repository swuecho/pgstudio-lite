import { WidgetCellEditor } from './WidgetCellEditor'
import type { NotebookPageController } from './useNotebookPageState'
import styles from './NotebookPage.module.css'

type NotebookParameterPanelProps = {
  controller: NotebookPageController
}

export function NotebookParameterPanel({ controller }: NotebookParameterPanelProps) {
  if (!controller.activeNotebookId || controller.parameterWidgets.length === 0) return null

  return (
    <section className={styles.parameterPanel}>
      <div className={styles.parameterPanelHeader}>
        <div>
          <div className={styles.parameterPanelTitle}>Parameters</div>
          <div className="history-meta">{controller.parameterWidgets.length} active widget parameter(s)</div>
        </div>
      </div>

      <div className={styles.parameterGrid}>
        {controller.parameterWidgets.map((item) => (
          <article key={item.cell.id} className={styles.parameterCard}>
            <div className={styles.parameterCardHead}>
              <div className={styles.parameterCardTitleRow}>
                <div className={styles.parameterCardTitle}>
                  {item.metadata.label || item.primaryKey || 'Parameter'}
                </div>
                <div className={styles.parameterCardMeta}>
                  <span className={styles.widgetTag}>{item.metadata.widgetType}</span>
                  <span className={styles.widgetTag}>{item.source}</span>
                  {item.metadata.required ? <span className={styles.widgetTag}>required</span> : null}
                </div>
              </div>
              <div className="history-meta">
                {item.parameterKeys.join(', ')}
                {item.usedByCellIds.length
                  ? ` · used by ${item.usedByCellIds.length} SQL cell(s)`
                  : ' · not referenced yet'}
                {item.validationCount ? ` · ${item.validationCount} validation issue(s)` : ''}
              </div>
            </div>

            <div className={styles.parameterCardBody}>
              <WidgetCellEditor
                metadata={item.metadata}
                disabled={controller.runningAll}
                valueOnly={
                  item.metadata.widgetType !== 'radio-group' && item.metadata.widgetType !== 'date-range'
                }
                collapsed={
                  item.metadata.widgetType === 'radio-group' || item.metadata.widgetType === 'date-range'
                }
                notebookId={controller.activeNotebookId}
                inputValues={controller.inputValues}
                sqlOptionsState={controller.resolvedOptionsByCell[item.cell.id]}
                onRefreshSqlOptions={() => controller.refreshSqlOptions(item.cell.id)}
                validationMessages={item.validationMessages}
                onChange={(next) => controller.updateParameterWidget(item.cell.id, next)}
              />
            </div>

            <div className={styles.parameterActions}>
              <button
                className="btn small"
                type="button"
                onClick={() => controller.jumpToInputCell(item.primaryKey)}
              >
                Open Widget
              </button>
              <button
                className="btn small"
                type="button"
                onClick={() => controller.resetParameterWidget(item.cell.id)}
              >
                Reset
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
