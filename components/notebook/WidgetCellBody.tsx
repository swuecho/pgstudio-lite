import { memo } from 'react'
import { WidgetCellEditor } from './WidgetCellEditor'
import type { NotebookPageController } from './useNotebookPageState'
import type { NotebookCell } from './types'
import type { NotebookWidgetMetadata } from '@/lib/notebook-widgets'

type WidgetCellBodyProps = {
  cell: NotebookCell
  controller: NotebookPageController
  widgetDraft: NotebookWidgetMetadata
  runningAll: boolean
  collapsed: boolean
  inputValues: Record<string, unknown>
  availableSqlTargets: Array<{ id: string; label: string }>
  onRefreshSqlOptions: () => void
  onChange: (next: NotebookWidgetMetadata) => void
  onTriggerAction: (metadata: NotebookWidgetMetadata) => void
}

export const WidgetCellBody = memo(function WidgetCellBody({
  cell,
  controller,
  widgetDraft,
  runningAll,
  collapsed,
  inputValues,
  availableSqlTargets,
  onRefreshSqlOptions,
  onChange,
  onTriggerAction,
}: WidgetCellBodyProps) {
  const sharedProps = {
    metadata: widgetDraft as any,
    disabled: runningAll,
    notebookId: controller.activeNotebookId,
    inputValues,
    sqlOptionsState: controller.resolvedOptionsByCell[cell.id],
    onRefreshSqlOptions,
    validationMessages: controller.validationMessagesByCell[cell.id],
    availableSqlTargets,
    onChange,
  }

  if (!collapsed) {
    return <WidgetCellEditor {...sharedProps} onTriggerAction={onTriggerAction} />
  }

  return <WidgetCellEditor {...sharedProps} collapsed />
})
