import type { AppProps } from 'next/app'
import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  DARK_MEDIA_QUERY,
  THEME_CHANGE_EVENT,
  applyResolvedTheme,
  prefersDark,
  readThemePreference,
} from '../lib/theme'
import '../styles/tokens.css'
import '../styles/globals.css'
import '../styles/dialogs.css'
import '../styles/feedback.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App({ Component, pageProps }: AppProps) {
  // The initial theme is applied before paint by the inline script in
  // _document. This only keeps a 'system' preference in sync when the OS
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
      <Component {...pageProps} />
    </QueryClientProvider>
  )
}
