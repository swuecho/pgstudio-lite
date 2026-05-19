import type { AppProps } from 'next/app'
import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
  useEffect(() => {
    const saved = (() => {
      try {
        return localStorage.getItem('pgstudio-theme')
      } catch {
        return null
      }
    })()
    const theme = saved === 'dark' ? 'dark' : 'light'
    document.documentElement.dataset.theme = theme
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <Component {...pageProps} />
    </QueryClientProvider>
  )
}
