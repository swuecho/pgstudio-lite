import { useRef } from 'react'
import type { NotebookCell, NotebookWidgetMetadata } from './types'
import { getDependentSqlTargetsForInputKeys, type ReactiveNotebookState } from '@/lib/notebook-reactive'
import { getChangedWidgetParamKeys, markQueuedCells } from './cellSyncHelpers'

export function useReactiveRunner(params: {
  setStatus: (value: string) => void
  reactiveRunGenerationRef: React.MutableRefObject<number>
  activeNotebookIdRef: React.MutableRefObject<string>
  runningAllRef: React.MutableRefObject<boolean>
  runningCellIdRef: React.MutableRefObject<string>
  sortedCellsRef: React.MutableRefObject<NotebookCell[]>
  draftByCellRef: React.MutableRefObject<Record<string, string>>
  widgetDraftByCellRef: React.MutableRefObject<Record<string, NotebookWidgetMetadata>>
  setQueuedRunByCell: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  enqueueExecution: <T>(label: string, execute: () => Promise<T>) => Promise<T>
  executeQueuedSqlRun: (input: {
    label: string
    cells: NotebookCell[]
    flushReason: string
    mode: 'single' | 'sequence'
    reactiveGeneration?: number
  }) => Promise<number>
}) {
  const {
    setStatus,
    reactiveRunGenerationRef,
    activeNotebookIdRef,
    runningAllRef,
    runningCellIdRef,
    sortedCellsRef,
    draftByCellRef,
    widgetDraftByCellRef,
    setQueuedRunByCell,
    enqueueExecution,
    executeQueuedSqlRun,
  } = params

  const reactiveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  function scheduleWidgetReactiveRuns(
    cellId: string,
    previous: NotebookWidgetMetadata,
    next: NotebookWidgetMetadata
  ) {
    const timer = reactiveTimersRef.current[cellId]
    if (timer) clearTimeout(timer)
    if (next.autoRun === false) return
    const changedKeys = getChangedWidgetParamKeys(previous, next)
    if (!changedKeys.length) return
    reactiveTimersRef.current[cellId] = setTimeout(() => {
      void rerunDependentSqlCells(cellId, changedKeys)
    }, 350)
  }

  async function rerunDependentSqlCells(inputCellId: string, inputKeys: string | string[]) {
    const keys = [...new Set((Array.isArray(inputKeys) ? inputKeys : [inputKeys]).filter(Boolean))]
    if (!keys.length) return
    const generation = reactiveRunGenerationRef.current + 1
    reactiveRunGenerationRef.current = generation

    const getState = (): ReactiveNotebookState => ({
      activeNotebookId: activeNotebookIdRef.current,
      runningAll: runningAllRef.current,
      runningCellId: runningCellIdRef.current,
      sortedCells: sortedCellsRef.current,
      draftByCell: draftByCellRef.current,
      widgetDraftByCell: widgetDraftByCellRef.current,
    })

    const targets = getDependentSqlTargetsForInputKeys(getState(), inputCellId, keys)
    if (!targets.length) return

    const statusLabel = keys.length === 1 ? `'${keys[0]}'` : `${keys.length} widget input(s)`

    try {
      setQueuedRunByCell((prev) =>
        markQueuedCells(
          prev,
          targets.map((cell) => cell.id)
        )
      )
      setStatus(`Input ${statusLabel} changed. Queuing ${targets.length} SQL cell(s)...`)
      await enqueueExecution('Auto-run', () =>
        executeQueuedSqlRun({
          label: 'Auto-run',
          cells: targets,
          flushReason: 'auto-run',
          mode: 'sequence',
          reactiveGeneration: generation,
        })
      )
    } catch (error) {
      setStatus(`Auto-run stopped: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function cleanupReactiveTimers() {
    for (const timer of Object.values(reactiveTimersRef.current)) clearTimeout(timer)
  }

  return {
    reactiveTimersRef,
    scheduleWidgetReactiveRuns,
    rerunDependentSqlCells,
    cleanupReactiveTimers,
  }
}
