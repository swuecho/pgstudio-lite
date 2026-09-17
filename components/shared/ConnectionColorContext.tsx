import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useThemeMode } from '@/hooks/useThemeMode'
import { connectionColorTones } from '@/lib/connection-color'
import { useConnectionColorStyle, type ConnectionColorStyle } from './hooks/useConnectionColor'

const ConnectionColorContext = createContext<ConnectionColorStyle | null>(null)

/**
 * Publishes the color of the connection a page is working against, so editors
 * deep in the tree (SQL, notebook cells, the jsonb editor) can tint themselves
 * without every intermediate component passing the color down.
 */
export function ConnectionColorProvider({
  connectionName,
  children,
}: {
  connectionName: string | null | undefined
  children: ReactNode
}) {
  const style = useConnectionColorStyle(connectionName)

  // Monaco paints its background from --vscode-editor-background, which
  // styles/globals.css pins to --editor-bg; setting it here tints every editor
  // on the page, including ones rendered into portals.
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--editor-bg', style.tint)
    return () => {
      root.style.removeProperty('--editor-bg')
    }
  }, [style.tint])

  return <ConnectionColorContext.Provider value={style}>{children}</ConnectionColorContext.Provider>
}

/**
 * Falls back to the uncolored style outside a provider, without touching the
 * connections query, so an editor renders standalone (in tests, for example).
 */
export function useActiveConnectionColor(): ConnectionColorStyle {
  const fromContext = useContext(ConnectionColorContext)
  const theme = useThemeMode()
  return useMemo(() => {
    if (fromContext) return fromContext
    const tones = connectionColorTones(null, theme)
    return {
      colorId: 'none' as const,
      ...tones,
      vars: { '--conn-accent': tones.accent, '--conn-tint': tones.tint },
    }
  }, [fromContext, theme])
}
