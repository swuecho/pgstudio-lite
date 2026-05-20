import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useConnections } from '../shared/hooks/useConnections'
import type { Notebook } from './types'
import {
  createNotebook,
  deleteNotebook,
  getNotebook,
  getNotebooks,
  updateNotebook,
} from '../../features/notebook/notebook.service'

export const NOTEBOOKS_QUERY_KEY = ['notebooks']

export function useNotebookCrudState(params: { setStatus: (value: string) => void }) {
  const { setStatus } = params
  const queryClient = useQueryClient()
  const [activeNotebookId, setActiveNotebookId] = useState<string>('')
  const [notebookSearch, setNotebookSearch] = useState('')

  const connectionsQuery = useConnections()
  const connections = connectionsQuery.connections
  const notebooksQuery = useQuery({ queryKey: NOTEBOOKS_QUERY_KEY, queryFn: () => getNotebooks() })
  const notebooks = useMemo(() => notebooksQuery.data?.items || [], [notebooksQuery.data?.items])

  useEffect(() => {
    if (!activeNotebookId && notebooks[0]?.id) setActiveNotebookId(notebooks[0].id)
    if (activeNotebookId && !notebooks.some((n) => n.id === activeNotebookId)) {
      setActiveNotebookId(notebooks[0]?.id || '')
    }
  }, [activeNotebookId, notebooks])

  const detailQuery = useQuery({
    queryKey: ['notebook', activeNotebookId],
    queryFn: () => getNotebook(activeNotebookId),
    enabled: Boolean(activeNotebookId),
  })

  const activeNotebook = detailQuery.data?.notebook
  const createNotebookMutation = useMutation({
    mutationFn: async () => {
      const connectionName = connectionsQuery.defaultConnectionName || connections[0]?.name
      return createNotebook(`Notebook ${notebooks.length + 1}`, connectionName)
    },
    onSuccess: (data) => {
      setStatus('Notebook created')
      setActiveNotebookId(data.item.id)
      void queryClient.invalidateQueries({ queryKey: NOTEBOOKS_QUERY_KEY })
    },
    onError: (error) => setStatus(error instanceof Error ? error.message : String(error)),
  })

  const renameNotebookMutation = useMutation({
    mutationFn: (payload: { id: string; title: string }) =>
      updateNotebook(payload.id, { title: payload.title }),
    onSuccess: () => {
      setStatus('Notebook renamed')
      void queryClient.invalidateQueries({ queryKey: NOTEBOOKS_QUERY_KEY })
      if (activeNotebookId) void queryClient.invalidateQueries({ queryKey: ['notebook', activeNotebookId] })
    },
    onError: (error) => setStatus(error instanceof Error ? error.message : String(error)),
  })

  const changeNotebookConnectionMutation = useMutation({
    mutationFn: (payload: { id: string; connectionName: string }) =>
      updateNotebook(payload.id, { connectionName: payload.connectionName }),
    onSuccess: () => {
      setStatus('Notebook connection updated')
      void queryClient.invalidateQueries({ queryKey: NOTEBOOKS_QUERY_KEY })
      if (activeNotebookId) void queryClient.invalidateQueries({ queryKey: ['notebook', activeNotebookId] })
    },
    onError: (error) => setStatus(error instanceof Error ? error.message : String(error)),
  })

  const deleteNotebookMutation = useMutation({
    mutationFn: (id: string) => deleteNotebook(id),
    onSuccess: () => {
      setStatus('Notebook deleted')
      void queryClient.invalidateQueries({ queryKey: NOTEBOOKS_QUERY_KEY })
    },
    onError: (error) => setStatus(error instanceof Error ? error.message : String(error)),
  })

  function renameNotebook(item: Notebook, nextTitle: string) {
    renameNotebookMutation.mutate({ id: item.id, title: nextTitle })
  }

  function removeNotebook(notebookId: string) {
    deleteNotebookMutation.mutate(notebookId)
  }

  function updateNotebookConnection(connectionName: string) {
    if (!activeNotebook?.id) return
    changeNotebookConnectionMutation.mutate({ id: activeNotebook.id, connectionName })
  }

  return {
    activeNotebook,
    activeNotebookId,
    connections,
    createNotebookMutation,
    detailQuery,
    notebookSearch,
    notebooks,
    removeNotebook,
    renameNotebook,
    setActiveNotebookId,
    setNotebookSearch,
    updateNotebookConnection,
  }
}
