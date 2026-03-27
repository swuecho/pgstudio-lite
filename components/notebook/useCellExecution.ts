import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { editor as MonacoEditorNs } from 'monaco-editor'
import type { QueryResult } from '../sql-editor/types'
import type { NotebookCell, NotebookWidgetMetadata } from './types'
import { buildInputValues } from '../../lib/notebook-reactive'
import { runCell } from '../../features/notebook/notebook.service'
import { markQueuedCells, clearQueuedCells } from './cellSyncHelpers'

export function useCellExecution(params: {
  activeNotebookId: string
  setStatus: (value: string) => void
  flushPendingSaves: (notebookId: string, reason?: string) => Promise<boolean>
}) {
  const { activeNotebookId, setStatus, flushPendingSaves } = params
  const queryClient = useQueryClient()

  const [runningCellId, setRunningCellId] = useState<string>('')
  const [runningAll, setRunningAll] = useState(false)
  const [resultsByCell, setResultsByCell] = useState<Record<string, QueryResult>>({})
  const [lastExecutedQueryByCell, setLastExecutedQueryByCell] = useState<Record<string, string>>({})
  const [queuedRunByCell, setQueuedRunByCell] = useState<Record<string, boolean>>({})

  const runningCellIdRef = useRef('')
  const runningAllRef = useRef(false)
  const executionQueueRef = useRef<Promise<void>>(Promise.resolve())
  const reactiveRunGenerationRef = useRef(0)
  const sqlEditorRefs = useRef<Record<string, MonacoEditorNs.IStandaloneCodeEditor>>({})

  const draftByCellRef = useRef<Record<string, string>>({})
  const widgetDraftByCellRef = useRef<Record<string, NotebookWidgetMetadata>>({})
  const sortedCellsRef = useRef<NotebookCell[]>([])
  const activeNotebookIdRef = useRef('')

  useEffect(() => { runningCellIdRef.current = runningCellId }, [runningCellId])
  useEffect(() => { runningAllRef.current = runningAll }, [runningAll])

  function focusNextSqlEditor(sortedCells: NotebookCell[], cellId: string) {
    const fromIndex = sortedCells.findIndex((cell) => cell.id === cellId)
    if (fromIndex === -1) return
    for (let i = fromIndex + 1; i < sortedCells.length; i += 1) {
      const next = sortedCells[i]
      if (next.type !== 'sql' || next.collapsed) continue
      const nextEditor = sqlEditorRefs.current[next.id]
      if (nextEditor) {
        nextEditor.focus()
        return
      }
    }
  }

  function enqueueExecution<T>(label: string, execute: () => Promise<T>) {
    if (runningAllRef.current || Boolean(runningCellIdRef.current)) {
      setStatus(`${label} queued`)
    }
    const queued = executionQueueRef.current.catch(() => undefined).then(execute)
    executionQueueRef.current = queued.then(() => undefined, () => undefined)
    return queued
  }

  async function executeQueuedSqlRun(input: {
    label: string
    cells: NotebookCell[]
    flushReason: string
    mode: 'single' | 'sequence'
    reactiveGeneration?: number
  }) {
    if (input.reactiveGeneration !== undefined && reactiveRunGenerationRef.current !== input.reactiveGeneration) {
      return 0
    }
    setQueuedRunByCell((prev) => clearQueuedCells(prev, input.cells.map((cell) => cell.id)))
    const notebookId = activeNotebookIdRef.current
    if (!notebookId) return 0
    if (!(await flushPendingSaves(notebookId, input.flushReason))) {
      return 0
    }
    if (input.reactiveGeneration !== undefined && reactiveRunGenerationRef.current !== input.reactiveGeneration) {
      return 0
    }

    const total = input.cells.length
    let successCount = 0

    if (input.mode === 'sequence') {
      setRunningAll(true)
    }

    try {
      for (const cell of input.cells) {
        if (input.reactiveGeneration !== undefined && reactiveRunGenerationRef.current !== input.reactiveGeneration) {
          return successCount
        }

        const currentNotebookId = activeNotebookIdRef.current
        if (!currentNotebookId) return successCount

        const query = (draftByCellRef.current[cell.id] ?? cell.content).trim()
        if (!query) continue

        setRunningCellId(cell.id)
        setStatus(total === 1 ? `Running cell #${cell.position + 1}...` : `Running ${input.label} cell #${cell.position + 1}...`)

        const result = await runCell(
          currentNotebookId,
          cell.id,
          query,
          buildInputValues(sortedCellsRef.current, widgetDraftByCellRef.current)
        )

        if (input.reactiveGeneration !== undefined && reactiveRunGenerationRef.current !== input.reactiveGeneration) {
          return successCount
        }

        setResultsByCell((prev) => ({ ...prev, [cell.id]: result }))
        setLastExecutedQueryByCell((prev) => ({ ...prev, [cell.id]: query }))
        successCount += 1
      }

      setStatus(
        input.mode === 'single'
          ? successCount ? 'Cell executed' : 'No runnable SQL cell'
          : `${input.label} completed (${successCount}/${total})`
      )
      return successCount
    } catch (error) {
      setStatus(`${input.label} stopped: ${error instanceof Error ? error.message : String(error)}`)
      return successCount
    } finally {
      setRunningCellId('')
      if (input.mode === 'sequence') {
        setRunningAll(false)
      }
      if (activeNotebookIdRef.current) {
        void queryClient.invalidateQueries({ queryKey: ['notebook', activeNotebookIdRef.current] })
      }
    }
  }

  async function runSqlCellWithShortcuts(cell: NotebookCell, runAndFocusNext = false) {
    const query = (draftByCellRef.current[cell.id] ?? cell.content).trim()
    if (!query) return
    try {
      setQueuedRunByCell((prev) => markQueuedCells(prev, [cell.id]))
      const executedCount = await enqueueExecution('Cell run', () =>
        executeQueuedSqlRun({
          label: 'Cell run',
          cells: [cell],
          flushReason: 'running a cell',
          mode: 'single',
        })
      )
      if (runAndFocusNext && executedCount > 0) focusNextSqlEditor(sortedCellsRef.current, cell.id)
    } catch {
      // Status and errors are already surfaced by mutation callbacks.
    }
  }

  async function runAllSqlCells(sortedCells: NotebookCell[]) {
    if (!activeNotebookId) return
    const sqlCells = sortedCells.filter((cell) => cell.type === 'sql')
    if (!sqlCells.length) {
      setStatus('No SQL cells to run')
      return
    }
    setQueuedRunByCell((prev) => markQueuedCells(prev, sqlCells.map((cell) => cell.id)))
    await enqueueExecution('Run all', () =>
      executeQueuedSqlRun({
        label: 'Run all',
        cells: sqlCells,
        flushReason: 'running all SQL cells',
        mode: 'sequence',
      })
    )
  }

  async function runTargetSqlCells(sortedCells: NotebookCell[], cellIds: string[]) {
    if (!activeNotebookId) return
    const targets = sortedCells.filter((cell) => cell.type === 'sql' && cellIds.includes(cell.id))
    if (!targets.length) {
      setStatus('No target SQL cells found')
      return
    }
    setQueuedRunByCell((prev) => markQueuedCells(prev, targets.map((cell) => cell.id)))
    await enqueueExecution('Target run', () =>
      executeQueuedSqlRun({
        label: 'Target run',
        cells: targets,
        flushReason: 'running target SQL cells',
        mode: 'sequence',
      })
    )
  }

  return {
    runningCellId,
    runningAll,
    resultsByCell,
    setResultsByCell,
    lastExecutedQueryByCell,
    setLastExecutedQueryByCell,
    queuedRunByCell,
    setQueuedRunByCell,
    runningCellIdRef,
    runningAllRef,
    reactiveRunGenerationRef,
    executionQueueRef,
    sqlEditorRefs,
    draftByCellRef,
    widgetDraftByCellRef,
    sortedCellsRef,
    activeNotebookIdRef,
    focusNextSqlEditor,
    enqueueExecution,
    executeQueuedSqlRun,
    runSqlCellWithShortcuts,
    runAllSqlCells,
    runTargetSqlCells,
  }
}
