import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { NotebookCell, NotebookWidgetMetadata } from './types'
import { updateCell } from '@/features/notebook/notebook.service'
import { useLatestRef } from '@/hooks/useLatestRef'
import { clearPendingSaveCell, clearSaveError, getPendingSaveEntries } from './cellSyncHelpers'

type CellSavePatch = { content?: string; metadata?: NotebookWidgetMetadata | null }
type SaveInit = { keepalive?: boolean }

const AUTOSAVE_DEBOUNCE_MS = 700

export function useCellAutoSave(params: { activeNotebookId: string; setStatus: (value: string) => void }) {
  const { activeNotebookId, setStatus } = params
  const queryClient = useQueryClient()

  const [pendingSaveByCell, setPendingSaveByCell] = useState<Record<string, boolean>>({})
  const [saveErrorByCell, setSaveErrorByCell] = useState<Record<string, string>>({})

  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingSavePayloadRef = useRef<Record<string, CellSavePatch>>({})
  /** Which notebook each pending save belongs to; needed once the page is gone. */
  const saveTargetByCellRef = useRef<Record<string, string>>({})
  const lastSyncedContentByCellRef = useRef<Record<string, string>>({})
  const lastSyncedWidgetByCellRef = useRef<Record<string, NotebookWidgetMetadata>>({})

  /** Removes and returns a cell's pending save (timer, payload, target). */
  function takePendingSave(cellId: string) {
    const timer = saveTimersRef.current[cellId]
    if (timer) clearTimeout(timer)
    delete saveTimersRef.current[cellId]
    const payload = pendingSavePayloadRef.current[cellId]
    delete pendingSavePayloadRef.current[cellId]
    const notebookId = saveTargetByCellRef.current[cellId]
    delete saveTargetByCellRef.current[cellId]
    return payload && notebookId ? { payload, notebookId } : null
  }

  function sendCellSave(cellId: string, notebookId: string, payload: CellSavePatch, init: SaveInit = {}) {
    void updateCell(notebookId, { cellId, ...payload }, init)
      .then(() => {
        setPendingSaveByCell((prev) => clearPendingSaveCell(prev, cellId))
        setSaveErrorByCell((prev) => clearSaveError(prev, cellId))
        setStatus('Autosaved')
        void queryClient.invalidateQueries({ queryKey: ['notebook', notebookId] })
      })
      .catch((error) => {
        setPendingSaveByCell((prev) => clearPendingSaveCell(prev, cellId))
        setSaveErrorByCell((prev) => ({
          ...prev,
          [cellId]: error instanceof Error ? error.message : String(error),
        }))
        setStatus(error instanceof Error ? error.message : String(error))
      })
  }

  /**
   * Fires every pending save immediately, without waiting on the results.
   *
   * For the moments when there is nothing left to await: the notebook page
   * unmounting (navigating to another page) or the document unloading (tab
   * close, reload). Before this existed, unmount cleared the debounce timers
   * and the last edits inside the debounce window were lost. `keepalive` lets
   * the browser complete the requests after the document has unloaded.
   */
  function flushPendingSavesNow(init: SaveInit = {}) {
    for (const entry of getPendingSaveEntries(pendingSavePayloadRef.current)) {
      const pending = takePendingSave(entry.cellId)
      if (pending) sendCellSave(entry.cellId, pending.notebookId, pending.payload, init)
    }
  }

  const flushPendingSavesNowRef = useLatestRef(flushPendingSavesNow)

  useEffect(() => {
    // Always call the latest render's flush: it is the one whose closures match
    // the current refs and state setters.
    const flushNow = (init?: SaveInit) => flushPendingSavesNowRef.current(init)
    const onBeforeUnload = () => flushNow({ keepalive: true })
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      flushNow()
    }
  }, [flushPendingSavesNowRef])

  function scheduleCellSave(cell: NotebookCell, patch: CellSavePatch, scheduledNotebookId?: string) {
    const targetNotebookId = scheduledNotebookId || activeNotebookId
    if (!targetNotebookId) return
    const existing = saveTimersRef.current[cell.id]
    if (existing) clearTimeout(existing)
    pendingSavePayloadRef.current[cell.id] = {
      ...pendingSavePayloadRef.current[cell.id],
      ...patch,
    }
    saveTargetByCellRef.current[cell.id] = targetNotebookId
    setPendingSaveByCell((prev) => ({ ...prev, [cell.id]: true }))
    setSaveErrorByCell((prev) => clearSaveError(prev, cell.id))

    saveTimersRef.current[cell.id] = setTimeout(() => {
      const pending = takePendingSave(cell.id)
      if (pending) sendCellSave(cell.id, pending.notebookId, pending.payload)
    }, AUTOSAVE_DEBOUNCE_MS)
  }

  async function flushPendingSaves(notebookId: string, reason?: string) {
    const entries = getPendingSaveEntries(pendingSavePayloadRef.current)
    if (!notebookId || !entries.length) return true

    setStatus(reason ? `Saving pending changes before ${reason}...` : 'Saving pending changes...')

    for (const entry of entries) {
      const timer = saveTimersRef.current[entry.cellId]
      if (timer) clearTimeout(timer)
      delete saveTimersRef.current[entry.cellId]
      delete saveTargetByCellRef.current[entry.cellId]
    }

    pendingSavePayloadRef.current = {}
    setPendingSaveByCell({})

    const failedEntries: Array<{ cellId: string; payload: CellSavePatch; error: unknown }> = []

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
      for (const entry of failedEntries) saveTargetByCellRef.current[entry.cellId] = notebookId
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
    flushPendingSavesNow,
  }
}
