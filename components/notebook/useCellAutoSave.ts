import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { NotebookCell, NotebookWidgetMetadata } from './types'
import { updateCell } from '../../features/notebook/notebook.service'
import { clearPendingSaveCell, clearSaveError, getPendingSaveEntries } from './cellSyncHelpers'

export function useCellAutoSave(params: { activeNotebookId: string; setStatus: (value: string) => void }) {
  const { activeNotebookId, setStatus } = params
  const queryClient = useQueryClient()

  const [pendingSaveByCell, setPendingSaveByCell] = useState<Record<string, boolean>>({})
  const [saveErrorByCell, setSaveErrorByCell] = useState<Record<string, string>>({})

  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingSavePayloadRef = useRef<
    Record<string, { content?: string; metadata?: NotebookWidgetMetadata | null }>
  >({})
  const lastSyncedContentByCellRef = useRef<Record<string, string>>({})
  const lastSyncedWidgetByCellRef = useRef<Record<string, NotebookWidgetMetadata>>({})

  useEffect(() => {
    const timers = saveTimersRef.current
    return () => {
      for (const timer of Object.values(timers)) clearTimeout(timer)
    }
  }, [])

  function scheduleCellSave(
    cell: NotebookCell,
    patch: { content?: string; metadata?: NotebookWidgetMetadata | null },
    scheduledNotebookId?: string
  ) {
    const targetNotebookId = scheduledNotebookId || activeNotebookId
    if (!targetNotebookId) return
    const existing = saveTimersRef.current[cell.id]
    if (existing) clearTimeout(existing)
    pendingSavePayloadRef.current[cell.id] = {
      ...pendingSavePayloadRef.current[cell.id],
      ...patch,
    }
    setPendingSaveByCell((prev) => ({ ...prev, [cell.id]: true }))
    setSaveErrorByCell((prev) => clearSaveError(prev, cell.id))

    saveTimersRef.current[cell.id] = setTimeout(() => {
      const payload = pendingSavePayloadRef.current[cell.id]
      delete pendingSavePayloadRef.current[cell.id]
      delete saveTimersRef.current[cell.id]
      if (!payload) return
      void updateCell(targetNotebookId, { cellId: cell.id, ...payload })
        .then(() => {
          setPendingSaveByCell((prev) => clearPendingSaveCell(prev, cell.id))
          setSaveErrorByCell((prev) => clearSaveError(prev, cell.id))
          setStatus('Autosaved')
          void queryClient.invalidateQueries({ queryKey: ['notebook', targetNotebookId] })
        })
        .catch((error) => {
          setPendingSaveByCell((prev) => clearPendingSaveCell(prev, cell.id))
          setSaveErrorByCell((prev) => ({
            ...prev,
            [cell.id]: error instanceof Error ? error.message : String(error),
          }))
          setStatus(error instanceof Error ? error.message : String(error))
        })
    }, 700)
  }

  async function flushPendingSaves(notebookId: string, reason?: string) {
    const entries = getPendingSaveEntries(pendingSavePayloadRef.current)
    if (!notebookId || !entries.length) return true

    setStatus(reason ? `Saving pending changes before ${reason}...` : 'Saving pending changes...')

    for (const entry of entries) {
      const timer = saveTimersRef.current[entry.cellId]
      if (timer) clearTimeout(timer)
      delete saveTimersRef.current[entry.cellId]
    }

    pendingSavePayloadRef.current = {}
    setPendingSaveByCell({})

    const failedEntries: Array<{
      cellId: string
      payload: { content?: string; metadata?: NotebookWidgetMetadata | null }
      error: unknown
    }> = []

    await Promise.all(
      entries.map(async (entry) => {
        try {
          await updateCell(notebookId, { cellId: entry.cellId, ...entry.payload })
        } catch (error) {
          failedEntries.push({ ...entry, error })
        }
      })
    )

    if (failedEntries.length) {
      pendingSavePayloadRef.current = Object.fromEntries(
        failedEntries.map((entry) => [entry.cellId, entry.payload])
      )
      setPendingSaveByCell(Object.fromEntries(failedEntries.map((entry) => [entry.cellId, true])))
      setSaveErrorByCell(
        Object.fromEntries(
          failedEntries.map((entry) => [
            entry.cellId,
            entry.error instanceof Error ? entry.error.message : String(entry.error),
          ])
        )
      )
      const firstError = failedEntries[0]?.error
      setStatus(firstError instanceof Error ? firstError.message : String(firstError))
      return false
    }

    setSaveErrorByCell({})
    void queryClient.invalidateQueries({ queryKey: ['notebook', notebookId] })
    setStatus('All changes saved')
    return true
  }

  return {
    pendingSaveByCell,
    setPendingSaveByCell,
    saveErrorByCell,
    setSaveErrorByCell,
    saveTimersRef,
    pendingSavePayloadRef,
    lastSyncedContentByCellRef,
    lastSyncedWidgetByCellRef,
    scheduleCellSave,
    flushPendingSaves,
  }
}
