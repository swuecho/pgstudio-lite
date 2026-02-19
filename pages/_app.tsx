import type { AppProps } from 'next/app'
import { useEffect } from 'react'
import '../styles/globals.css'

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

  return <Component {...pageProps} />
}
