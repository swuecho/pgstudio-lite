import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createSnippet,
  deleteSnippet as deleteSnippetService,
  getSnippets,
  updateSnippet,
} from '../../features/sql/sql.service'
import { QueryTab, SnippetItem } from './types'
import { useSqlEditorSnippetsStore } from './stores/sqlEditorSnippetsStore'

type StatusState = { text: string; tone: string }

type UseSqlEditorSnippetsParams = {
  connectionName: string
  activeQueryTab: QueryTab | undefined
  setQueryTabs: Dispatch<SetStateAction<QueryTab[]>>
  setStatus: Dispatch<SetStateAction<StatusState>>
  setActiveNavTab: Dispatch<SetStateAction<'history' | 'snippets' | 'explorer'>>
}

export function useSqlEditorSnippets({
  connectionName,
  activeQueryTab,
  setQueryTabs,
  setStatus,
  setActiveNavTab,
}: UseSqlEditorSnippetsParams) {
  const queryClient = useQueryClient()
  const renamingSnippetId = useSqlEditorSnippetsStore((s) => s.renamingSnippetId)
  const setRenamingSnippetId = useSqlEditorSnippetsStore((s) => s.setRenamingSnippetId)
  const renameDraft = useSqlEditorSnippetsStore((s) => s.renameDraft)
  const setRenameDraft = useSqlEditorSnippetsStore((s) => s.setRenameDraft)

  const snippetsQuery = useQuery({
    queryKey: ['sql', 'snippets', connectionName, 300],
    queryFn: () => getSnippets(300, connectionName),
    enabled: Boolean(connectionName),
  })
  const snippetItems = snippetsQuery.data?.items || []

  const createSnippetMutation = useMutation({
    mutationFn: ({ title, queryText }: { title: string; queryText: string }) =>
      createSnippet(title, queryText, connectionName),
  })
  const updateSnippetMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { title?: string; queryText?: string } }) =>
      updateSnippet(id, payload, connectionName),
  })
  const deleteSnippetMutation = useMutation({
    mutationFn: (id: string) => deleteSnippetService(id, connectionName),
  })

  function patchSnippetInCache(item: SnippetItem) {
    queryClient.setQueryData<{ items: SnippetItem[] }>(['sql', 'snippets', connectionName, 300], (prev) => {
      const current = prev?.items || []
      const exists = current.some((entry) => entry.id === item.id)
      return {
        items: exists ? current.map((entry) => (entry.id === item.id ? item : entry)) : [item, ...current],
      }
    })
  }

  function removeSnippetFromCache(id: string) {
    queryClient.setQueryData<{ items: SnippetItem[] }>(['sql', 'snippets', connectionName, 300], (prev) => ({
      items: (prev?.items || []).filter((entry) => entry.id !== id),
    }))
  }

  async function loadSnippets() {
    await snippetsQuery.refetch()
  }

  function getSuggestedSnippetTitle(queryText?: string) {
    const content = (queryText || '').trim()
    return (
      content
        .split('\n')[0]
        .replace(/^--\s*/, '')
        .slice(0, 48) || 'New snippet'
    )
  }

  async function saveCurrentAsSnippet(options: { forceCreate?: boolean; title?: string } = {}) {
    const forceCreate = options.forceCreate === true
    const content = (activeQueryTab?.query || '').trim()
    if (!content) {
      setStatus({ text: 'Query is empty', tone: 'warning' })
      return
    }

    try {
      const canUpdateBoundSnippet =
        activeQueryTab?.snippetId && activeQueryTab.snippetConnectionName === connectionName && !forceCreate
      if (canUpdateBoundSnippet) {
        const payload = await updateSnippetMutation.mutateAsync({
          id: activeQueryTab.snippetId as string,
          payload: { queryText: content },
        })
        setStatus({ text: `Updated snippet: ${payload.item.title}`, tone: 'ok' })
        patchSnippetInCache(payload.item)
        setQueryTabs((all) =>
          all.map((tab) =>
            tab.id === activeQueryTab?.id
              ? {
                  ...tab,
                  title: payload.item.title,
                  query: payload.item.query_text,
                  snippetId: payload.item.id,
                  snippetConnectionName: payload.item.connection_name,
                  dirty: false,
                }
              : tab
          )
        )
        return
      }

      const title = options.title?.trim()
      if (!title) return
      const payload = await createSnippetMutation.mutateAsync({ title, queryText: content })
      setStatus({ text: `Saved snippet: ${payload.item.title}`, tone: 'ok' })
      patchSnippetInCache(payload.item)
      setQueryTabs((all) =>
        all.map((tab) =>
          tab.id === activeQueryTab?.id
            ? {
                ...tab,
                title: payload.item.title,
                query: payload.item.query_text,
                snippetId: payload.item.id,
                snippetConnectionName: payload.item.connection_name,
                dirty: false,
              }
            : tab
        )
      )
      setActiveNavTab('snippets')
    } catch (error) {
      setStatus({
        text: error instanceof Error ? error.message : 'Failed to save snippet',
        tone: 'error',
      })
    }
  }

  async function autosaveSnippetDraft(tabId: string, snippetId: string, queryText: string) {
    const content = queryText.trim()
    if (!content) return
    try {
      const payload = await updateSnippetMutation.mutateAsync({
        id: snippetId,
        payload: { queryText: content },
      })
      patchSnippetInCache(payload.item)
      setQueryTabs((all) =>
        all.map((tab) =>
          tab.id === tabId && tab.query.trim() === content
            ? {
                ...tab,
                title: payload.item.title,
                query: payload.item.query_text,
                snippetConnectionName: payload.item.connection_name,
                dirty: false,
              }
            : tab
        )
      )
    } catch (error) {
      setStatus({
        text: error instanceof Error ? error.message : 'Autosave failed',
        tone: 'warning',
      })
    }
  }

  async function renameSnippet(item: SnippetItem, nextTitle?: string) {
    const title = (nextTitle ?? item.title).trim()
    if (!title || title === item.title) {
      setRenamingSnippetId(null)
      setRenameDraft('')
      return
    }
    try {
      const payload = await updateSnippetMutation.mutateAsync({ id: item.id, payload: { title } })
      setStatus({ text: `Renamed snippet: ${payload.item.title}`, tone: 'ok' })
      patchSnippetInCache(payload.item)
      setQueryTabs((all) =>
        all.map((tab) =>
          tab.snippetId === payload.item.id
            ? {
                ...tab,
                title: payload.item.title,
              }
            : tab
        )
      )
      setRenamingSnippetId(null)
      setRenameDraft('')
    } catch (error) {
      setStatus({
        text: error instanceof Error ? error.message : 'Failed to rename snippet',
        tone: 'error',
      })
    }
  }

  async function duplicateSnippet(item: SnippetItem, title: string) {
    const nextTitle = title.trim()
    if (!nextTitle) return
    const payload = await createSnippetMutation.mutateAsync({ title: nextTitle, queryText: item.query_text })
    patchSnippetInCache(payload.item)
    setStatus({ text: `Duplicated snippet: ${payload.item.title}`, tone: 'ok' })
    setActiveNavTab('snippets')
  }

  async function deleteSnippet(item: SnippetItem) {
    await deleteSnippetMutation.mutateAsync(item.id)
    removeSnippetFromCache(item.id)
    setQueryTabs((all) =>
      all.map((tab) => (tab.snippetId === item.id ? { ...tab, snippetId: undefined, dirty: true } : tab))
    )
    setStatus({ text: `Deleted snippet: ${item.title}`, tone: 'ok' })
  }

  function getDuplicateSnippetTitle(item: SnippetItem) {
    return `${item.title} copy`
  }

  function beginRenameSnippet(item: SnippetItem) {
    setRenamingSnippetId(item.id)
    setRenameDraft(item.title)
  }

  function cancelRenameSnippet() {
    setRenamingSnippetId(null)
    setRenameDraft('')
  }

  useEffect(() => {
    if (!activeQueryTab?.snippetId || !activeQueryTab.dirty) return
    if (activeQueryTab.snippetConnectionName !== connectionName) return
    const timer = window.setTimeout(() => {
      void autosaveSnippetDraft(activeQueryTab.id, activeQueryTab.snippetId as string, activeQueryTab.query)
    }, 1200)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeQueryTab?.id,
    activeQueryTab?.snippetId,
    activeQueryTab?.snippetConnectionName,
    activeQueryTab?.query,
    activeQueryTab?.dirty,
    connectionName,
  ])

  return {
    snippetItems,
    loadingSnippets: snippetsQuery.isFetching,
    savingSnippet:
      createSnippetMutation.isPending || updateSnippetMutation.isPending || deleteSnippetMutation.isPending,
    renamingSnippetId,
    renameDraft,
    setRenameDraft,
    beginRenameSnippet,
    cancelRenameSnippet,
    loadSnippets,
    getSuggestedSnippetTitle,
    saveCurrentAsSnippet,
    renameSnippet,
    getDuplicateSnippetTitle,
    duplicateSnippet,
    deleteSnippet,
  }
}
