import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  clearTableEditorViewRecent,
  deleteTableEditorViewBookmark,
  getTableEditorViews,
  importTableEditorViewsFromLocalStorage,
  recordTableEditorViewRecent,
  saveTableEditorViewBookmark,
  updateTableEditorViewBookmark,
} from '@/features/table/table.service'
import type {
  TableEditorBookmark,
  TableEditorRecentView,
  TableEditorViewState,
} from '@/lib/table-editor-views'

export const EMPTY_RECENT_VIEWS: TableEditorRecentView[] = []
export const EMPTY_BOOKMARKS: TableEditorBookmark[] = []

const LEGACY_STORAGE_KEY = 'pgstudio-table-editor-views'

function viewsQueryKey(connectionName: string) {
  return ['table-editor', 'views', connectionName] as const
}

type LegacyStoragePayload = {
  state?: {
    bookmarksByConnection?: Record<string, TableEditorBookmark[]>
    recentViewsByConnection?: Record<string, TableEditorRecentView[]>
  }
}

function readLegacyLocalStorageViews(): LegacyStoragePayload['state'] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LegacyStoragePayload
    return parsed.state ?? null
  } catch {
    return null
  }
}

function clearLegacyLocalStorageViews() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(LEGACY_STORAGE_KEY)
}

export function useTableEditorViews(connectionName: string) {
  const queryClient = useQueryClient()
  const migratedRef = useRef(false)

  const viewsQuery = useQuery({
    queryKey: viewsQueryKey(connectionName),
    queryFn: () => getTableEditorViews(connectionName),
    enabled: Boolean(connectionName),
  })

  const saveBookmarkMutation = useMutation({
    mutationFn: ({ view, title }: { view: TableEditorViewState; title: string }) =>
      saveTableEditorViewBookmark({
        connectionName: view.connectionName,
        title,
        activeTable: view.activeTable,
        filter: view.filter,
      }),
  })

  const updateBookmarkMutation = useMutation({
    mutationFn: (args: { id: string; title?: string; pinned?: boolean }) =>
      updateTableEditorViewBookmark({ connectionName, ...args }),
  })

  const deleteBookmarkMutation = useMutation({
    mutationFn: (id: string) => deleteTableEditorViewBookmark(id, connectionName),
  })

  const recordRecentMutation = useMutation({
    mutationFn: (view: TableEditorViewState) =>
      recordTableEditorViewRecent({
        connectionName: view.connectionName,
        activeTable: view.activeTable,
        filter: view.filter,
      }),
  })

  const clearRecentMutation = useMutation({
    mutationFn: () => clearTableEditorViewRecent(connectionName),
  })

  function patchViewsCache(
    updater: (current: { bookmarks: TableEditorBookmark[]; recentViews: TableEditorRecentView[] }) => {
      bookmarks: TableEditorBookmark[]
      recentViews: TableEditorRecentView[]
    }
  ) {
    queryClient.setQueryData<{ bookmarks: TableEditorBookmark[]; recentViews: TableEditorRecentView[] }>(
      viewsQueryKey(connectionName),
      (prev) => {
        const current = prev ?? { bookmarks: EMPTY_BOOKMARKS, recentViews: EMPTY_RECENT_VIEWS }
        return updater(current)
      }
    )
  }

  async function saveBookmark(view: TableEditorViewState, title: string) {
    const payload = await saveBookmarkMutation.mutateAsync({ view, title })
    patchViewsCache((current) => {
      const exists = current.bookmarks.some((bookmark) => bookmark.id === payload.item.id)
      return {
        ...current,
        bookmarks: exists
          ? current.bookmarks.map((bookmark) => (bookmark.id === payload.item.id ? payload.item : bookmark))
          : [payload.item, ...current.bookmarks],
      }
    })
    return payload.item.id
  }

  async function renameBookmark(id: string, title: string) {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return
    const payload = await updateBookmarkMutation.mutateAsync({ id, title: trimmedTitle })
    patchViewsCache((current) => ({
      ...current,
      bookmarks: current.bookmarks.map((bookmark) => (bookmark.id === id ? payload.item : bookmark)),
    }))
  }

  async function toggleBookmarkPinned(id: string) {
    const current = viewsQuery.data?.bookmarks.find((bookmark) => bookmark.id === id)
    if (!current) return
    const payload = await updateBookmarkMutation.mutateAsync({ id, pinned: !current.pinned })
    patchViewsCache((cache) => ({
      ...cache,
      bookmarks: cache.bookmarks.map((bookmark) => (bookmark.id === id ? payload.item : bookmark)),
    }))
  }

  async function deleteBookmark(id: string) {
    await deleteBookmarkMutation.mutateAsync(id)
    patchViewsCache((current) => ({
      ...current,
      bookmarks: current.bookmarks.filter((bookmark) => bookmark.id !== id),
    }))
  }

  function recordRecentView(view: TableEditorViewState) {
    if (!view.connectionName || !view.activeTable) return
    void recordRecentMutation
      .mutateAsync(view)
      .then((payload) => {
        if (!payload.item) return
        void viewsQuery.refetch()
      })
      .catch(() => {
        // Recent view recording is best-effort.
      })
  }

  async function clearRecentViews() {
    await clearRecentMutation.mutateAsync()
    patchViewsCache((current) => ({
      ...current,
      recentViews: EMPTY_RECENT_VIEWS,
    }))
  }

  useEffect(() => {
    if (migratedRef.current) return
    const legacy = readLegacyLocalStorageViews()
    if (!legacy) return

    const bookmarksByConnection = legacy.bookmarksByConnection ?? {}
    const recentViewsByConnection = legacy.recentViewsByConnection ?? {}
    const hasData =
      Object.values(bookmarksByConnection).some((items) => items.length > 0) ||
      Object.values(recentViewsByConnection).some((items) => items.length > 0)

    if (!hasData) {
      clearLegacyLocalStorageViews()
      migratedRef.current = true
      return
    }

    migratedRef.current = true
    void importTableEditorViewsFromLocalStorage({ bookmarksByConnection, recentViewsByConnection })
      .then(() => {
        clearLegacyLocalStorageViews()
        void queryClient.invalidateQueries({ queryKey: ['table-editor', 'views'] })
      })
      .catch(() => {
        migratedRef.current = false
      })
  }, [queryClient])

  return {
    bookmarks: viewsQuery.data?.bookmarks ?? EMPTY_BOOKMARKS,
    recentViews: viewsQuery.data?.recentViews ?? EMPTY_RECENT_VIEWS,
    loadingViews: viewsQuery.isFetching,
    saveBookmark,
    renameBookmark,
    toggleBookmarkPinned,
    deleteBookmark,
    recordRecentView,
    clearRecentViews,
  }
}
