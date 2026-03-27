import { useEffect, useRef, useState } from 'react'
import type { NotebookCell, NotebookResolvedOptionsState, NotebookWidgetMetadata } from './types'
import { runOptionQuery } from '../../features/notebook/notebook.service'
import { mapQueryResultToOptions } from '../../lib/notebook-option-source'

export function useWidgetOptions(params: {
  activeNotebookId: string
  sortedCells: NotebookCell[]
  widgetDraftByCell: Record<string, NotebookWidgetMetadata>
  inputValues: Record<string, unknown>
}) {
  const { activeNotebookId, sortedCells, widgetDraftByCell, inputValues } = params

  const [resolvedOptionsByCell, setResolvedOptionsByCell] = useState<Record<string, NotebookResolvedOptionsState>>({})
  const [optionsRefreshTickByCell, setOptionsRefreshTickByCell] = useState<Record<string, number>>({})

  const optionsTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const optionRequestSeqRef = useRef<Record<string, number>>({})
  const optionRequestSignatureRef = useRef<Record<string, string>>({})

  useEffect(() => {
    const nextTrackedCellIds = new Set<string>()
    const serializedInputValues = JSON.stringify(inputValues)

    for (const cell of sortedCells) {
      if (cell.type !== 'widget') continue
      const metadata = widgetDraftByCell[cell.id]
      if (!metadata) continue
      if ((metadata.widgetType !== 'select' && metadata.widgetType !== 'multiselect') || metadata.config?.optionSource !== 'sql') continue

      const query = metadata.config?.optionsQuery?.trim() || ''
      if (!activeNotebookId || !query) continue

      nextTrackedCellIds.add(cell.id)
      const refreshTick = optionsRefreshTickByCell[cell.id] || 0
      const signature = JSON.stringify({ notebookId: activeNotebookId, query, inputValues: serializedInputValues, refreshTick })
      if (optionRequestSignatureRef.current[cell.id] === signature) continue
      optionRequestSignatureRef.current[cell.id] = signature

      const existingTimer = optionsTimersRef.current[cell.id]
      if (existingTimer) clearTimeout(existingTimer)
      setResolvedOptionsByCell((prev) => ({
        ...prev,
        [cell.id]: {
          options: prev[cell.id]?.options || [],
          loading: true,
          error: '',
          lastLoadedAt: prev[cell.id]?.lastLoadedAt,
        },
      }))

      optionsTimersRef.current[cell.id] = setTimeout(() => {
        const requestSeq = (optionRequestSeqRef.current[cell.id] || 0) + 1
        optionRequestSeqRef.current[cell.id] = requestSeq
        void runOptionQuery(activeNotebookId, query, inputValues)
          .then((result) => {
            if (optionRequestSeqRef.current[cell.id] !== requestSeq) return
            setResolvedOptionsByCell((prev) => ({
              ...prev,
              [cell.id]: {
                options: mapQueryResultToOptions(result),
                loading: false,
                error: '',
                lastLoadedAt: new Date().toISOString(),
              },
            }))
          })
          .catch((error) => {
            if (optionRequestSeqRef.current[cell.id] !== requestSeq) return
            setResolvedOptionsByCell((prev) => ({
              ...prev,
              [cell.id]: {
                options: prev[cell.id]?.options || [],
                loading: false,
                error: error instanceof Error ? error.message : String(error),
                lastLoadedAt: prev[cell.id]?.lastLoadedAt,
              },
            }))
          })
      }, 250)
    }

    for (const cellId of Object.keys(optionsTimersRef.current)) {
      if (nextTrackedCellIds.has(cellId)) continue
      clearTimeout(optionsTimersRef.current[cellId])
      delete optionsTimersRef.current[cellId]
      delete optionRequestSignatureRef.current[cellId]
    }

    setResolvedOptionsByCell((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([cellId]) => nextTrackedCellIds.has(cellId)))
    )
  }, [activeNotebookId, inputValues, optionsRefreshTickByCell, sortedCells, widgetDraftByCell])

  useEffect(() => {
    return () => {
      for (const timer of Object.values(optionsTimersRef.current)) clearTimeout(timer)
    }
  }, [])

  function refreshSqlOptions(cellId: string) {
    setOptionsRefreshTickByCell((prev) => ({ ...prev, [cellId]: (prev[cellId] || 0) + 1 }))
  }

  return {
    resolvedOptionsByCell,
    refreshSqlOptions,
  }
}
