import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteNotebookRun,
  getNotebookRun,
  getNotebookSchedule,
  listNotebookRuns,
  triggerNotebookRun,
  updateNotebookSchedule,
} from '@/features/notebook/notebook.service'
import { formatScheduleInterval } from '@/lib/notebook-schedule-options'

/**
 * Run history and schedule for the active notebook.
 *
 * Runs can land without any client action (the server-side scheduler), so the
 * list polls: often while the runs panel is open, slowly otherwise. When the
 * newest run changes, the notebook detail is invalidated so the editor picks
 * up the refreshed cell results.
 */
export function useNotebookRuns(params: {
  notebookId: string
  panelOpen: boolean
  setStatus: (value: string) => void
}) {
  const { notebookId, panelOpen, setStatus } = params
  const queryClient = useQueryClient()
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  useEffect(() => {
    setSelectedRunId(null)
  }, [notebookId])

  const runsQuery = useQuery({
    queryKey: ['notebook-runs', notebookId],
    queryFn: () => listNotebookRuns(notebookId),
    enabled: Boolean(notebookId),
    refetchInterval: panelOpen ? 10_000 : 60_000,
  })

  const scheduleQuery = useQuery({
    queryKey: ['notebook-schedule', notebookId],
    queryFn: () => getNotebookSchedule(notebookId),
    enabled: Boolean(notebookId) && panelOpen,
    refetchInterval: panelOpen ? 30_000 : false,
  })

  const runDetailQuery = useQuery({
    queryKey: ['notebook-run', notebookId, selectedRunId],
    queryFn: () => getNotebookRun(notebookId, selectedRunId as string),
    enabled: Boolean(notebookId && selectedRunId),
  })

  const runs = runsQuery.data?.items ?? []
  const latestRunId = runs[0]?.id ?? null
  const previousLatestRunIdRef = useRef<string | null>(null)
  useEffect(() => {
    const previous = previousLatestRunIdRef.current
    previousLatestRunIdRef.current = latestRunId
    if (!notebookId || !latestRunId || previous === null || previous === latestRunId) return
    // A run finished since we last looked: cell results on the server changed.
    void queryClient.invalidateQueries({ queryKey: ['notebook', notebookId] })
    void queryClient.invalidateQueries({ queryKey: ['notebook-schedule', notebookId] })
  }, [latestRunId, notebookId, queryClient])

  function reportError(error: unknown) {
    setStatus(error instanceof Error ? error.message : String(error))
  }

  function invalidateRuns() {
    void queryClient.invalidateQueries({ queryKey: ['notebook-runs', notebookId] })
    void queryClient.invalidateQueries({ queryKey: ['notebook-schedule', notebookId] })
  }

  const runNowMutation = useMutation({
    mutationFn: () => triggerNotebookRun(notebookId),
    onSuccess: ({ item }) => {
      setStatus(
        item.status === 'success'
          ? `Run finished: ${item.cell_count} cell(s)`
          : `Run finished with ${item.error_count} error(s)`
      )
      queryClient.setQueryData(['notebook-run', notebookId, item.id], { item })
      setSelectedRunId(item.id)
      invalidateRuns()
      void queryClient.invalidateQueries({ queryKey: ['notebook', notebookId] })
    },
    onError: reportError,
  })

  const scheduleMutation = useMutation({
    mutationFn: (input: { enabled: boolean; intervalMinutes: number }) =>
      updateNotebookSchedule(notebookId, input),
    onSuccess: ({ item }) => {
      queryClient.setQueryData(['notebook-schedule', notebookId], { item })
      setStatus(
        item.enabled ? `Scheduled ${formatScheduleInterval(item.interval_minutes)}` : 'Schedule disabled'
      )
    },
    onError: reportError,
  })

  const deleteRunMutation = useMutation({
    mutationFn: (runId: string) => deleteNotebookRun(notebookId, runId),
    onSuccess: (_, runId) => {
      setStatus('Run deleted')
      if (selectedRunId === runId) setSelectedRunId(null)
      invalidateRuns()
    },
    onError: reportError,
  })

  return {
    runs,
    runsLoading: runsQuery.isLoading,
    schedule: scheduleQuery.data?.item ?? null,
    selectedRunId,
    setSelectedRunId,
    selectedRun: runDetailQuery.data?.item ?? null,
    selectedRunLoading: runDetailQuery.isLoading,
    runNow: () => runNowMutation.mutate(),
    runNowPending: runNowMutation.isPending,
    updateSchedule: (input: { enabled: boolean; intervalMinutes: number }) => scheduleMutation.mutate(input),
    schedulePending: scheduleMutation.isPending,
    deleteRun: (runId: string) => deleteRunMutation.mutate(runId),
  }
}
