import { useEffect } from 'react'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Navigate, Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { NotificationCenter } from '@/components/shared/NotificationCenter'
import { notify } from '@/components/shared/stores/notificationStore'
import { parseSearchRecord, stringifySearchRecord } from '@/components/shared/navigation'
import {
  DARK_MEDIA_QUERY,
  THEME_CHANGE_EVENT,
  applyResolvedTheme,
  prefersDark,
  readThemePreference,
} from '@/lib/theme'
import SqlEditorPage from './routes/index'
import ActivityPage from './routes/activity'
import NotebookPage from './routes/notebook'
import TableEditorPage from './routes/table-editor'
import TracePage from './routes/trace'
import '@/styles/tokens.css'
import '@/styles/globals.css'
import '@/styles/dialogs.css'
import '@/styles/feedback.css'

function describeError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Unexpected error'
}

/**
 * Surfaces request failures app-wide. Without this, anything not wired to a
 * component's local error state failed silently.
 */
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      notify({ tone: 'error', title: 'Request failed', message: describeError(error) })
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      notify({ tone: 'error', title: 'Action failed', message: describeError(error) })
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

function RootLayout() {
  // The initial theme is applied before paint by /theme-bootstrap.js in
  // index.html. This only keeps a 'system' preference in sync when the OS
  // switches while the app is open.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(DARK_MEDIA_QUERY)

    const onSystemThemeChange = () => {
      if (readThemePreference() !== 'system') return
      applyResolvedTheme(prefersDark() ? 'dark' : 'light')
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
    }

    media.addEventListener('change', onSystemThemeChange)
    return () => media.removeEventListener('change', onSystemThemeChange)
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <NotificationCenter />
    </QueryClientProvider>
  )
}

const rootRoute = createRootRoute({
  component: RootLayout,
  // Unknown paths land on the SQL editor rather than a blank page.
  notFoundComponent: () => <Navigate to="/" replace />,
})

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: SqlEditorPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/table-editor', component: TableEditorPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/notebook', component: NotebookPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/activity', component: ActivityPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/trace', component: TracePage }),
])

export function createAppRouter() {
  return createRouter({
    routeTree,
    // Plain string search params; see components/shared/navigation.tsx.
    parseSearch: parseSearchRecord,
    stringifySearch: stringifySearchRecord,
    // Pages are all client-rendered and fetch through React Query.
    defaultPreload: false,
  })
}
